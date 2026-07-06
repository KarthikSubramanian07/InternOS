import categoriesConfig from "../config/categories.json";
import greenhouseTokens from "../config/companies-greenhouse.json";
import leverTokens from "../config/companies-lever.json";
import ashbyTokens from "../config/companies-ashby.json";

import { fetchGreenhouse } from "./scraper/greenhouse";
import { fetchLever } from "./scraper/lever";
import { fetchAshby } from "./scraper/ashby";
import { fetchSimplifyJobs } from "./sources/simplifyJobs";
import { fetchVanshb03 } from "./sources/vanshb03";
import { fetchSpeedyApply } from "./sources/speedyapply";
import { fetchNuftQuant } from "./sources/nuftQuant";

import { categorizeAndFilter, filterOptionsFromProfile } from "./filters/categorize";
import { syncJobsToNotion } from "./notion/sync";
import { SeenStore, getCursor, setCursor, loadProfile } from "./storage";
import { hashJob, mapLimit } from "./util";
import type { CategoryConfig, Env, Job, RawJob } from "./types";

type Platform = "greenhouse" | "lever" | "ashby";
interface BoardTask {
  platform: Platform;
  token: string;
}

/**
 * One scheduled scrape run:
 *   1. Always pull the GitHub lists (cheap fetches, huge yield).
 *   2. Pull a rotating window of company boards (bounded by BOARD_FETCHES_PER_RUN).
 *   3. Categorize + filter to the user's preferences.
 *   4. Dedupe and create up to MAX_NEW_PER_RUN Notion rows.
 * Returns a human-readable summary string (also logged and returned by /run).
 */
export async function runScrape(env: Env): Promise<string> {
  const profile = await loadProfile(env.JOBS);
  if (!profile) {
    const msg = "No profile found in KV. Run `npm run setup:profile` before the first scrape.";
    console.warn(msg);
    return msg;
  }

  // Combined board list, in a stable order for the rotating cursor.
  const tasks: BoardTask[] = [
    ...(greenhouseTokens as string[]).map((token) => ({ platform: "greenhouse" as const, token })),
    ...(leverTokens as string[]).map((token) => ({ platform: "lever" as const, token })),
    ...(ashbyTokens as string[]).map((token) => ({ platform: "ashby" as const, token })),
  ];

  const window = clampInt(env.BOARD_FETCHES_PER_RUN, 20, 1, 900);
  let cursor = await getCursor(env.JOBS);
  if (cursor >= tasks.length) cursor = 0;

  const slice: BoardTask[] = [];
  for (let i = 0; i < Math.min(window, tasks.length); i++) {
    slice.push(tasks[(cursor + i) % tasks.length]);
  }
  const nextCursor = tasks.length ? (cursor + slice.length) % tasks.length : 0;

  // Boards (concurrency-limited) + GitHub lists, in parallel.
  const [boardRaws, githubRaws] = await Promise.all([
    mapLimit(slice, 6, (task) => fetchBoard(task)),
    fetchGithubLists(),
  ]);

  const allRaw: RawJob[] = [...boardRaws.flat(), ...githubRaws];

  const matched = categorizeAndFilter(
    allRaw,
    categoriesConfig as CategoryConfig,
    filterOptionsFromProfile(
      profile,
      env.INTERNSHIPS_ONLY !== "false",
      clampInt(env.MAX_AGE_DAYS, 31, 0, 3650),
      env.SIMPLIFY_MIN_DATE ?? "",
    ),
  );

  // Dedupe within this run, then newest-first so fresh roles win the per-run cap.
  const unique = dedupe(matched);
  unique.sort((a, b) => (b.datePosted ?? "").localeCompare(a.datePosted ?? ""));

  const seen = new SeenStore(env.JOBS);
  await seen.load();
  const result = await syncJobsToNotion(unique, env, seen);
  await seen.save();
  await setCursor(env.JOBS, nextCursor);

  const summary =
    `InternOS scrape: boards ${cursor}–${cursor + slice.length - 1} of ${tasks.length}, ` +
    `raw=${allRaw.length}, matched=${unique.length}, created=${result.created}, ` +
    `seen=${result.skipped}, deferred=${result.deferred}, failed=${result.failed}; ` +
    `cursor→${nextCursor}, memory=${seen.size}`;
  console.log(summary);
  return summary;
}

async function fetchBoard(task: BoardTask): Promise<RawJob[]> {
  try {
    if (task.platform === "greenhouse") return await fetchGreenhouse(task.token);
    if (task.platform === "lever") return await fetchLever(task.token);
    return await fetchAshby(task.token);
  } catch (err) {
    console.warn(`${task.platform} ${task.token}: ${(err as Error).message}`);
    return [];
  }
}

async function fetchGithubLists(): Promise<RawJob[]> {
  const results = await Promise.allSettled([
    fetchSimplifyJobs(),
    fetchVanshb03(),
    fetchSpeedyApply(),
    fetchNuftQuant(),
  ]);
  const out: RawJob[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(...r.value);
    else console.warn(`github source failed: ${r.reason}`);
  }
  return out;
}

function dedupe(jobs: Job[]): Job[] {
  const byHash = new Map<string, Job>();
  for (const job of jobs) {
    const h = hashJob(job);
    if (!byHash.has(h)) byHash.set(h, job);
  }
  return [...byHash.values()];
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
