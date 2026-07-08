import type { Env, RawJob } from "./types";
import { timingSafeEqual, toIsoDate } from "./util";
import { loadProfile } from "./storage";
import { ingestRaw } from "./cron";

/**
 * Accept externally-scraped jobs and run them through the same categorize → score
 * → dedupe → Notion-sync pipeline as the cron. This is how sources a browserless
 * Worker can't scrape itself (Indeed / Glassdoor / ZipRecruiter / LinkedIn via the
 * JobSpy companion) get in: the companion POSTs normalized jobs here.
 *
 * Auth: same shared secret as /webhook and /run (?token= or X-InternOS-Token).
 * Body: { "jobs": [{ company, role, url, location?, datePosted?, description?,
 *         salary?, source? }, ...] }  (source defaults to "jobspy").
 */
export async function handleIngest(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("x-internos-token") ?? "";
  if (!env.WEBHOOK_SECRET || !timingSafeEqual(token, env.WEBHOOK_SECRET)) {
    return new Response("forbidden", { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const incoming = Array.isArray(body?.jobs) ? body.jobs : [];
  const raws: RawJob[] = [];
  for (const j of incoming.slice(0, 400)) {
    const raw = normalizeIncoming(j);
    if (raw) raws.push(raw);
  }
  if (raws.length === 0) {
    return Response.json({ ok: false, error: "no valid jobs (need company, role, url)" }, { status: 400 });
  }

  const profile = await loadProfile(env.JOBS);
  if (!profile) {
    return Response.json({ ok: false, error: "no profile in KV" }, { status: 400 });
  }

  // Ingest does zero board fetches, so it can create more rows per call than the
  // scheduled scrape without risking the 50-subrequest budget.
  const r = await ingestRaw(env, raws, profile, 40);
  const summary = {
    ok: true,
    received: raws.length,
    matched: r.matched,
    created: r.result.created,
    skipped: r.result.skipped,
    deferred: r.result.deferred,
    failed: r.result.failed,
  };
  console.log(`ingest: ${JSON.stringify(summary)}`);
  return Response.json(summary);
}

export function normalizeIncoming(j: any): RawJob | null {
  const company = String(j?.company ?? "").trim();
  const role = String(j?.role ?? j?.title ?? "").trim();
  const urlStr = String(j?.url ?? j?.job_url ?? "").trim();
  if (!company || !role || !urlStr) return null;

  const source = String(j?.source ?? j?.site ?? "jobspy").trim() || "jobspy";
  return {
    company,
    role,
    location: String(j?.location ?? "").trim(),
    url: urlStr,
    datePosted: toIsoDate(j?.datePosted ?? j?.date_posted ?? null),
    description: typeof j?.description === "string" ? j.description.slice(0, 3000) : "",
    salary: typeof j?.salary === "string" ? j.salary.slice(0, 120) : "",
    source: source.startsWith("jobspy") ? source : `jobspy:${source}`,
  };
}
