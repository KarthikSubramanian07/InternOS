import type { Env } from "../types";
import { timingSafeEqual } from "../util";
import { loadProfile } from "../storage";
import {
  NotionClient,
  draftsToUpdateProperties,
  readJobFromPage,
} from "../notion/client";
import { draftApplication } from "../drafting/groq";
import { createGmailDraft } from "../gmail/drafts";

/**
 * Notion database automation ("Apply ✅ → true") posts here. We:
 *   1. verify the shared secret (?token=... or X-InternOS-Token header),
 *   2. ack immediately (Notion webhooks want a fast 2xx),
 *   3. draft + write back in the background via ctx.waitUntil.
 * A KV guard makes repeated fires idempotent (no duplicate Gmail drafts).
 */
export async function handleWebhook(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("x-internos-token") ?? "";
  if (!timingSafeEqual(token, env.WEBHOOK_SECRET ?? "")) {
    return new Response("forbidden", { status: 403 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // Notion's newer webhook integrations send a one-time verification handshake.
  if (payload?.verification_token && !extractPageId(payload)) {
    console.log("Notion verification_token received:", payload.verification_token);
    return Response.json({ ok: true, status: "verified" });
  }

  const pageId = extractPageId(payload);
  if (!pageId) {
    return Response.json({ ok: false, error: "no page id in payload" }, { status: 400 });
  }

  ctx.waitUntil(draftWithGuard(env, pageId));
  return Response.json({ ok: true, status: "processing", pageId });
}

/**
 * Draft for one page, guarded against duplicate work. Shared by the webhook and
 * the cron poll (src/poll.ts) so a checked box gets drafted exactly once whether
 * it arrives via webhook or is discovered by polling. On failure the guard is
 * cleared so it retries next poll / on re-check.
 */
export async function draftWithGuard(env: Env, pageId: string): Promise<"drafted" | "skipped" | "failed"> {
  const guardKey = `drafted:${pageId}`;
  if (await env.JOBS.get(guardKey)) return "skipped";
  await env.JOBS.put(guardKey, "1", { expirationTtl: 86400 });
  try {
    await processDrafting(pageId, env);
    return "drafted";
  } catch (err) {
    console.error("drafting failed:", (err as Error).stack ?? err);
    await env.JOBS.delete(guardKey);
    return "failed";
  }
}

async function processDrafting(pageId: string, env: Env): Promise<void> {
  const notion = new NotionClient(env.NOTION_TOKEN);
  const page = await notion.getPage(pageId);
  const job = readJobFromPage(page);

  // Safety: only act when the box is actually checked.
  if (!job.applyChecked) {
    console.log(`page ${pageId}: Apply not checked, skipping`);
    return;
  }
  if (!job.role && !job.company) {
    throw new Error("page has no company/role to draft against");
  }

  const profile = await loadProfile(env.JOBS);
  if (!profile) throw new Error("no profile in KV — run `npm run setup:profile`");

  const drafts = await draftApplication(env, job, profile);

  let gmailLink: string | null = null;
  try {
    gmailLink = await createGmailDraft(env, {
      subject: drafts.recruiter_email.subject,
      body: drafts.recruiter_email.body,
    });
  } catch (err) {
    console.warn("Gmail draft skipped:", (err as Error).message);
  }

  await notion.updatePage(pageId, draftsToUpdateProperties({ drafts, gmailDraftLink: gmailLink }));
  console.log(`drafted ${job.company} — ${job.role} (${pageId})`);
}

const UUID_RE = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i;

/** Pull the Notion page id out of the automation payload (shape varies by Notion version). */
function extractPageId(payload: any): string | null {
  const candidates = [
    payload?.data?.id,
    payload?.page?.id,
    payload?.entity?.id,
    payload?.id,
    payload?.data?.page?.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && UUID_RE.test(c)) return c;
  }
  // Last resort: scan the stringified payload for the first uuid-shaped value.
  try {
    const match = JSON.stringify(payload).match(UUID_RE);
    if (match) return match[0];
  } catch {
    /* ignore */
  }
  return null;
}
