/**
 * Rule-based fit score (0-100) computed at scrape time — no LLM, so it stays on
 * the free scrape path and every row arrives pre-ranked in Notion. It blends
 * category alignment with how much of the applicant's background the posting
 * calls for, then guards on seniority (an intern shouldn't rank a "Senior" role
 * highly). Verdict bands follow the ai-job-search rubric (Strong 75+ … Poor <30).
 */

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "our", "are", "will", "that", "this", "have", "from",
  "your", "who", "all", "can", "not", "but", "what", "how", "why", "new", "etc", "will",
  "their", "they", "them", "per", "via", "into", "out", "about", "including", "such", "any",
  "role", "work", "team", "job", "years", "year", "experience", "skills", "ability", "strong",
]);

function tokenSet(text: string): Set<string> {
  const out = new Set<string>();
  const matches = (text || "").toLowerCase().match(/[a-z0-9+#.]{2,}/g) || [];
  for (const t of matches) {
    if (t.length >= 3 && !STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

export type FitVerdict = "Strong" | "Good" | "Moderate" | "Weak" | "Poor";

export interface MatchResult {
  score: number;
  verdict: FitVerdict;
}

export function verdictFor(score: number): FitVerdict {
  if (score >= 75) return "Strong";
  if (score >= 60) return "Good";
  if (score >= 45) return "Moderate";
  if (score >= 30) return "Weak";
  return "Poor";
}

/** How many overlapping skill tokens count as a full skills match. */
const FULL_OVERLAP_AT = 12;

/** Precompute the candidate's token set + lowercased target categories once per run. */
export interface Candidate {
  tokens: Set<string>;
  categories: string[];
}

export function buildCandidate(resumeText: string, targetCategories: string[]): Candidate {
  return {
    tokens: tokenSet(`${resumeText} ${targetCategories.join(" ")}`),
    categories: targetCategories.map((c) => c.toLowerCase()),
  };
}

/** Score one job against a precomputed candidate (the per-job hot path).
 * `boosted` is a lowercased set of categories that have converted (Interview/Offer);
 * a match nudges the score up so learned-good categories rank higher over time. */
export function scoreWithCandidate(
  candidate: Candidate,
  job: { role: string; description?: string; category?: string },
  boosted: Set<string> = new Set(),
): MatchResult {
  // Weight the title by repeating it; cap the description so scoring stays cheap.
  const jd = tokenSet(`${job.role} ${job.role} ${(job.description ?? "").slice(0, 800)}`);
  if (candidate.tokens.size === 0 || jd.size === 0) {
    return { score: 0, verdict: "Poor" };
  }

  let overlap = 0;
  for (const t of candidate.tokens) if (jd.has(t)) overlap++;
  const overlapNorm = Math.min(1, overlap / FULL_OVERLAP_AT);

  const categoryFit = candidate.categories.includes((job.category ?? "").toLowerCase()) ? 1 : 0.5;
  let score = Math.round(100 * (0.5 * categoryFit + 0.5 * overlapNorm));

  const title = job.role.toLowerCase();
  if (/\b(senior|staff|principal|lead|manager|director|head of|vp)\b/.test(title)) {
    score = Math.min(score, 35); // wrong seniority for an intern
  }
  if (/\b(intern|internship|co-?op|new ?grad|university|student)\b/.test(title)) {
    score = score + 6;
  }
  if (boosted.size > 0 && boosted.has((job.category ?? "").toLowerCase())) {
    score = score + 8; // this category has converted before
  }
  score = Math.max(0, Math.min(100, score));

  return { score, verdict: verdictFor(score) };
}

/** Convenience one-shot (builds the candidate then scores) — handy for tests. */
export function matchScore(
  resumeText: string,
  targetCategories: string[],
  job: { role: string; description?: string; category?: string },
): MatchResult {
  return scoreWithCandidate(buildCandidate(resumeText, targetCategories), job);
}
