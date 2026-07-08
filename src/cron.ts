import categoriesConfig from "../config/categories.json";
import locationsConfig from "../config/locations.json";
import greenhouseTokens from "../config/companies-greenhouse.json";
import leverTokens from "../config/companies-lever.json";
import ashbyTokens from "../config/companies-ashby.json";
import smartRecruitersTokens from "../config/companies-smartrecruiters.json";
import recruiteeTokens from "../config/companies-recruitee.json";

import { fetchGreenhouse } from "./scraper/greenhouse";
import { fetchLever } from "./scraper/lever";
import { fetchAshby } from "./scraper/ashby";
import { fetchSmartRecruiters } from "./scraper/smartrecruiters";
import { fetchRecruitee } from "./scraper/recruitee";
import { fetchSimplifyJobs } from "./sources/simplifyJobs";
import { fetchVanshb03 } from "./sources/vanshb03";
import { fetchSpeedyApply } from "./sources/speedyapply";
import { fetchNuftQuant } from "./sources/nuftQuant";
import { fetchRemotive } from "./sources/remotive";

import { categorizeAndFilter, filterOptionsFromProfile } from "./filters/categorize";
import { syncJobsToNotion } from "./notion/sync";
import { refreshBoosts } from "./analytics";
import { SeenStore, getCursor, setCursor, loadProfile } from "./storage";
import { hashJob, mapLimit } from "./util";
import type { CategoryConfig, Env, Job, LocationConfig, Profile, RawJob } from "./types";

type Platform = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "recruitee";
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
    ...(smartRecruitersTokens as string[]).map((token) => ({ platform: "smartrecruiters" as const, token })),
    ...(recruiteeTokens as string[]).map((token) => ({ platform: "recruitee" as const, token })),
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

  const r = await ingestRaw(env, allRaw, profile);
  await setCursor(env.JOBS, nextCursor);

  const summary =
    `InternOS scrape: boards ${cursor}–${cursor + slice.length - 1} of ${tasks.length}, ` +
    `raw=${allRaw.length}, matched=${r.matched}, created=${r.result.created}, ` +
    `seen=${r.result.skipped}, deferred=${r.result.deferred}, failed=${r.result.failed}; ` +
    `cursor→${nextCursor}, memory=${r.memory}`;
  console.log(summary);
  return summary;
}

export interface IngestOutcome {
  matched: number;
  memory: number;
  result: Awaited<ReturnType<typeof syncJobsToNotion>>;
}

/**
 * Shared tail of the pipeline: categorize + score + flags, dedupe against the KV
 * seen-set, and create new Notion rows. Used by both the scheduled scrape and the
 * /ingest endpoint (which feeds in jobs scraped elsewhere, e.g. by the JobSpy
 * companion). `maxNew` overrides the per-run create cap (ingest does no board
 * fetches, so it has subrequest room to create more).
 */
export async function ingestRaw(
  env: Env,
  allRaw: RawJob[],
  profile: Profile,
  maxNew?: number,
): Promise<IngestOutcome> {
  // Outcome-driven recalibration: categories that reached Interview/Offer get a boost.
  const boosted = await refreshBoosts(env).catch((err) => {
    console.warn("boost refresh failed:", (err as Error).message);
    return [] as string[];
  });

  const matched = categorizeAndFilter(
    allRaw,
    categoriesConfig as CategoryConfig,
    filterOptionsFromProfile(
      profile,
      env.INTERNSHIPS_ONLY !== "false",
      clampInt(env.MAX_AGE_DAYS, 31, 0, 3650),
      env.SIMPLIFY_MIN_DATE ?? "",
      locationsConfig as LocationConfig,
      boosted,
    ),
  );

  // Dedupe within this batch, then newest-first so fresh roles win the create cap.
  const unique = dedupe(matched);
  unique.sort((a, b) => (b.datePosted ?? "").localeCompare(a.datePosted ?? ""));

  const seen = new SeenStore(env.JOBS);
  await seen.load();
  const result = await syncJobsToNotion(unique, env, seen, maxNew);
  await seen.save();

  return { matched: unique.length, memory: seen.size, result };
}

async function fetchBoard(task: BoardTask): Promise<RawJob[]> {
  try {
    switch (task.platform) {
      case "greenhouse":
        return await fetchGreenhouse(task.token);
      case "lever":
        return await fetchLever(task.token);
      case "ashby":
        return await fetchAshby(task.token);
      case "smartrecruiters":
        return await fetchSmartRecruiters(task.token);
      case "recruitee":
        return await fetchRecruitee(task.token);
    }
  } catch (err) {
    console.warn(`${task.platform} ${task.token}: ${(err as Error).message}`);
  }
  return [];
}

async function fetchGithubLists(): Promise<RawJob[]> {
  // Curated GitHub lists + always-on single-endpoint API sources (Remotive).
  const results = await Promise.allSettled([
    fetchSimplifyJobs(),
    fetchVanshb03(),
    fetchSpeedyApply(),
    fetchNuftQuant(),
    fetchRemotive(),
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
