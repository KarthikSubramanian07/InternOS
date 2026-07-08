import type { Env } from "./types";
import { runScrape } from "./cron";
import { pollPendingDrafts } from "./poll";
import { handleWebhook } from "./webhook/handler";
import { computeStats } from "./analytics";
import { handleOpen, handleClick } from "./tracking";
import { landingPage } from "./landing";
import { timingSafeEqual } from "./util";

// The frequent cron only polls Notion for checked-but-undrafted rows; any other
// cron entry runs a full scrape. Keep this in sync with `crons` in wrangler.toml.
const POLL_CRON = "*/10 * * * *";

export default {
  /** Cron trigger: frequent = draft poll; otherwise = scrape + Notion sync. */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === POLL_CRON) {
      ctx.waitUntil(
        pollPendingDrafts(env).catch((err) => console.error("poll failed:", (err as Error).stack ?? err)),
      );
    } else {
      ctx.waitUntil(
        runScrape(env).catch((err) => console.error("scrape failed:", (err as Error).stack ?? err)),
      );
    }
  },

  /** HTTP: Notion webhook, health, manual run, and a small status page. */
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // Notion database-automation webhook (Apply ✅ → draft everything).
    if (url.pathname === "/webhook/notion" || url.pathname === "/webhook") {
      return handleWebhook(req, env, ctx);
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "internos" });
    }

    // Email open tracking: 1x1 pixel. Public (no secret) — recipients hit it.
    if (url.pathname.startsWith("/t/o/")) {
      return handleOpen(url.pathname.slice("/t/o/".length), env, ctx);
    }
    // Email click tracking: log + redirect to ?u=<target>.
    if (url.pathname.startsWith("/t/c/")) {
      return handleClick(url.pathname.slice("/t/c/".length), url.searchParams.get("u") ?? "", env, ctx);
    }

    // Application-funnel analytics (protected by the shared secret).
    if (url.pathname === "/stats") {
      if (!env.WEBHOOK_SECRET || !timingSafeEqual(url.searchParams.get("token") ?? "", env.WEBHOOK_SECRET)) {
        return new Response("forbidden", { status: 403 });
      }
      return Response.json(await computeStats(env));
    }

    // Manual scrape trigger, protected by the same shared secret as the webhook.
    if (url.pathname === "/run" && req.method === "POST") {
      if (!env.WEBHOOK_SECRET || !timingSafeEqual(url.searchParams.get("token") ?? "", env.WEBHOOK_SECRET)) {
        return new Response("forbidden", { status: 403 });
      }
      const summary = await runScrape(env);
      return new Response(summary, { headers: { "content-type": "text/plain; charset=utf-8" } });
    }

    if (url.pathname === "/") {
      return new Response(landingPage(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
