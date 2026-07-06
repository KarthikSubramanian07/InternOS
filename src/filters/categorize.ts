import type { Category, CategoryConfig, Job, Profile, RawJob } from "../types";
import { looksLikeInternship, normalize } from "../util";

/**
 * Rule-based categorization — deliberately NO LLM here (keeps the scrape path
 * free and rate-limit-proof). Categories and keywords come entirely from
 * config/categories.json, so users add/remove categories without touching code.
 *
 * Precedence:
 *   1. keyword hit in the role title
 *   2. the source's category hint (single-topic GitHub lists)
 *   3. keyword hit anywhere in the description
 *   4. "Other"
 */
export function categorize(raw: RawJob, config: CategoryConfig): Category {
  const title = normalize(raw.role);
  const titleHit = firstMatch(title, config);
  if (titleHit) return titleHit;

  if (raw.categoryHint) return raw.categoryHint;

  const descHit = firstMatch(normalize(raw.description ?? ""), config);
  if (descHit) return descHit;

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
  /** Location substrings to keep. Empty = keep all. */
  locations: string[];
  /** Only keep postings dated within this many days. 0 = no date filtering. */
  maxAgeDays: number;
  /** For the Simplify source only, drop anything dated before this ISO date. "" = off. */
  simplifyMinDate: string;
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
  const wantLocations = opts.locations.map((l) => l.toLowerCase()).filter(Boolean);

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
    // internship heuristic to the broad company-board pulls.
    const isCurated = raw.source.startsWith("github");
    if (opts.internshipsOnly && !isCurated && !looksLikeInternship(`${raw.role} ${raw.description ?? ""}`)) {
      continue;
    }
    const category = categorize(raw, config);

    if (wantCategories.size > 0 && !wantCategories.has(category.toLowerCase())) continue;

    if (wantLocations.length > 0) {
      const loc = normalize(raw.location);
      const remoteOk = wantLocations.includes("remote") && /remote|anywhere/.test(loc);
      const matched = remoteOk || wantLocations.some((l) => loc.includes(l));
      if (!matched) continue;
    }

    const { categoryHint: _hint, ...rest } = raw;
    out.push({ ...rest, category });
  }
  return out;
}

/** Pull the filter options out of a profile + env, with sane defaults. */
export function filterOptionsFromProfile(
  profile: Profile,
  internshipsOnly: boolean,
  maxAgeDays: number,
  simplifyMinDate: string,
): FilterOptions {
  return {
    internshipsOnly,
    targetCategories: profile.targetCategories ?? [],
    locations: profile.locations ?? [],
    maxAgeDays,
    simplifyMinDate,
  };
}
