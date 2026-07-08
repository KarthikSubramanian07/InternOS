import type { Category, CategoryConfig, Job, LocationConfig, Profile, RawJob } from "../types";
import { looksLikeInternship, normalize, resolveLocation } from "../util";
import { buildCandidate, scoreWithCandidate } from "./score";
import { jobFlags } from "./flags";

/**
 * Rule-based categorization — deliberately NO LLM here (keeps the scrape path
 * free and rate-limit-proof). Categories and keywords come entirely from
 * config/categories.json, so users add/remove categories without touching code.
 *
 * Precedence:
 *   1. keyword hit in the role title
 *   2. the source's category hint (single-topic GitHub lists)
 *   3. "Other"
 *
 * We match on the title only (not the description) — internship titles almost
 * always name the discipline, and scanning thousands of 4KB descriptions per run
 * blows the Worker CPU budget.
 */
export function categorize(raw: RawJob, config: CategoryConfig): Category {
  const titleHit = firstMatch(normalize(raw.role), config);
  if (titleHit) return titleHit;
  if (raw.categoryHint) return raw.categoryHint;
  return "Other";
}

function firstMatch(haystack: string, config: CategoryConfig): Category | null {
  if (!haystack) return null;
  for (const [category, keywords] of Object.entries(config)) {
    for (const kw of keywords) {
      if (haystack.includes(kw.toLowerCase())) return category;
    }
  }
  return null;
}

export interface FilterOptions {
  internshipsOnly: boolean;
  /** Category names to keep. Empty = keep all. */
  targetCategories: string[];
  /** Region/metro names to keep (must match keys in config/locations.json). Empty = keep all. */
  locations: string[];
  /** region name -> matching city substrings, from config/locations.json. */
  locationConfig: LocationConfig;
  /** Only keep postings dated within this many days. 0 = no date filtering. */
  maxAgeDays: number;
  /** For the Simplify source only, drop anything dated before this ISO date. "" = off. */
  simplifyMinDate: string;
  /** Applicant background, used to compute the rule-based match score. */
  resumeText: string;
  /** Categories that have converted (Interview/Offer) get a scoring boost. */
  boostedCategories: string[];
}

/** Source label for the SimplifyJobs list (used by the Simplify-only date cutoff). */
const SIMPLIFY_SOURCE_PREFIX = "github:SimplifyJobs";

/**
 * Categorize every raw job and apply the user's filters. Returns fully-formed
 * Job objects ready for dedupe + Notion sync.
 */
export function categorizeAndFilter(
  raws: RawJob[],
  config: CategoryConfig,
  opts: FilterOptions,
): Job[] {
  const wantCategories = new Set(opts.targetCategories.map((c) => c.toLowerCase()));

  // Location targeting has two independent signals: a "Remote" region (matched
  // via the resolveLocation isRemote flag) and physical metros (matched by city
  // substrings from config). We expand only known config regions into city subs
  // — an unknown/typo region contributes nothing rather than over-matching as a
  // naked substring. Remote synonyms are excluded from city subs so a hybrid role
  // that merely mentions "remote" can't match a physical-metro filter.
  const REMOTE_WORDS = new Set(["remote", "anywhere", "work from home", "wfh", "distributed"]);
  let wantsRemote = false;
  const wantCitySubs: string[] = [];
  for (const region of opts.locations) {
    if (!region) continue;
    if (region.toLowerCase() === "remote") {
      wantsRemote = true;
      continue;
    }
    const key = Object.keys(opts.locationConfig).find((k) => k.toLowerCase() === region.toLowerCase());
    if (key) {
      for (const sub of opts.locationConfig[key]) {
        const s = sub.toLowerCase();
        if (!REMOTE_WORDS.has(s)) wantCitySubs.push(s);
      }
    }
  }
  const hasLocationFilter = wantsRemote || wantCitySubs.length > 0;

  // Precompute the candidate token set + boosted categories once (not per job).
  const candidate = buildCandidate(opts.resumeText, opts.targetCategories);
  const boosted = new Set(opts.boostedCategories.map((c) => c.toLowerCase()));

  // Date window: keep only postings dated within the last `maxAgeDays` days.
  let cutoffIso = "";
  let todayIso = "";
  if (opts.maxAgeDays > 0) {
    const now = new Date();
    todayIso = now.toISOString().slice(0, 10);
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - opts.maxAgeDays);
    cutoffIso = cutoff.toISOString().slice(0, 10);
  }

  const out: Job[] = [];
  for (const raw of raws) {
    // Date filter: drop anything with no date or older than the window.
    if (opts.maxAgeDays > 0) {
      if (!raw.datePosted) continue;
      if (raw.datePosted < cutoffIso || raw.datePosted > todayIso) continue;
    }

    // Simplify-only cutoff: everything before this date has been reviewed manually.
    if (opts.simplifyMinDate && raw.source.startsWith(SIMPLIFY_SOURCE_PREFIX)) {
      if (!raw.datePosted || raw.datePosted < opts.simplifyMinDate) continue;
    }
    // GitHub lists are already curated internship boards, so only apply the
    // internship heuristic to the broad company-board pulls. Title-only — scanning
    // full descriptions across thousands of rows exceeds the Worker CPU budget.
    const isCurated = raw.source.startsWith("github");
    if (opts.internshipsOnly && !isCurated && !looksLikeInternship(raw.role)) {
      continue;
    }
    const category = categorize(raw, config);

    if (wantCategories.size > 0 && !wantCategories.has(category.toLowerCase())) continue;

    // Relabel remote roles as "Remote" (hybrid keeps its city = in-person).
    const { display: displayLoc, match: matchLoc, isRemote } = resolveLocation(raw.location);
    if (hasLocationFilter) {
      const matched = (wantsRemote && isRemote) || wantCitySubs.some((sub) => matchLoc.includes(sub));
      if (!matched) continue;
    }

    const { categoryHint: _hint, ...rest } = raw;
    const { score, verdict } = scoreWithCandidate(
      candidate,
      { role: raw.role, description: raw.description, category },
      boosted,
    );
    const flags = jobFlags({ role: raw.role, description: raw.description });
    out.push({ ...rest, location: displayLoc, category, matchScore: score, fit: verdict, flags });
  }
  return out;
}

/** Pull the filter options out of a profile + env, with sane defaults. */
export function filterOptionsFromProfile(
  profile: Profile,
  internshipsOnly: boolean,
  maxAgeDays: number,
  simplifyMinDate: string,
  locationConfig: LocationConfig,
  boostedCategories: string[] = [],
): FilterOptions {
  return {
    internshipsOnly,
    targetCategories: profile.targetCategories ?? [],
    locations: profile.locations ?? [],
    locationConfig,
    maxAgeDays,
    simplifyMinDate,
    resumeText: profile.resumeText ?? "",
    boostedCategories,
  };
}
