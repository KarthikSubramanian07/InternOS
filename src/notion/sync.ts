import type { Env, Job } from "../types";
import { hashJob, sleep } from "../util";
import { SeenStore } from "../storage";
import { NotionClient, jobToCreateProperties } from "./client";

export interface SyncResult {
  created: number;
  /** already in the seen-set */
  skipped: number;
  /** new but deferred to a later run because we hit MAX_NEW_PER_RUN */
  deferred: number;
  failed: number;
}

/**
 * Create a Notion row per new job. Dedupe is via the KV seen-set (hash of
 * company+role+url). We only mark a job seen once its row is actually created,
 * so anything deferred by the per-run cap resurfaces next run.
 */
export async function syncJobsToNotion(
  jobs: Job[],
  env: Env,
  seen: SeenStore,
): Promise<SyncResult> {
  const notion = new NotionClient(env.NOTION_TOKEN);
  const maxNew = clampInt(env.MAX_NEW_PER_RUN, 20, 1, 950);

  let created = 0;
  let skipped = 0;
  let deferred = 0;
  let failed = 0;

  for (const job of jobs) {
    const h = hashJob(job);
    if (seen.has(h)) {
      skipped++;
      continue;
    }
    if (created >= maxNew) {
      deferred++;
      continue; // leave unseen; next run will pick it up
    }
    try {
      await notion.createPage(env.NOTION_DATABASE_ID, jobToCreateProperties(job));
      seen.add(h);
      created++;
      await sleep(340); // stay under Notion's ~3 req/s limit
    } catch (err) {
      failed++;
      console.error(`notion create failed (${job.company} — ${job.role}): ${(err as Error).message}`);
    }
  }

  return { created, skipped, deferred, failed };
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
