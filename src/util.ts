import type { Job } from "./types";

/** Lowercase + collapse whitespace, for keyword matching. */
export function normalize(s: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Stable dedupe identity for a job: company + role + location — deliberately NOT
 * the url, so the SAME posting listed on multiple sources (Simplify links to the
 * employer, Greenhouse links to its own board, etc.) collapses to one row. Uses a
 * fast synchronous hash (not crypto) — dedupe needs no cryptographic strength and
 * hashing thousands of rows with crypto.subtle would eat the Worker CPU budget.
 */
export function hashJob(job: Pick<Job, "company" | "role" | "location">): string {
  const basis = [normalize(job.company), normalize(job.role), normalizeLocation(job.location)].join("|");
  return fnv1a(basis, 0x811c9dc5) + fnv1a(basis, 0x01000193);
}

/** Loose location normalization so "San Jose" and "San Jose, CA" dedupe together. */
function normalizeLocation(loc: string): string {
  const n = normalize(loc);
  if (!n || /remote|anywhere|us|usa|united states/.test(n)) return n.split(/[,;]/)[0].trim();
  // Keep only the first locality token (before a comma/semicolon) to fold
  // "City, State" and "City" variants of the same posting together.
  return n.split(/[,;]/)[0].trim();
}

function fnv1a(str: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Resolve a raw location into a display label, a normalized `match` string, and
 * an `isRemote` flag (normalizes once). Remote roles are relabeled "Remote" for
 * display; hybrid counts as in-person (not remote). `match` is always the full
 * normalized string so city matching still works even when a remote role also
 * names a city — the caller matches the Remote region via `isRemote`, and city
 * regions via `match`, keeping the two signals independent.
 */
export function resolveLocation(raw: string): { display: string; match: string; isRemote: boolean } {
  const n = normalize(raw);
  if (!n) return { display: "", match: "", isRemote: false };
  const isHybrid = /hybrid/.test(n);
  const isRemote = !isHybrid && /(^|[^a-z])(remote|anywhere|work from home|wfh|distributed)([^a-z]|$)/.test(n);
  return { display: isRemote ? "Remote" : raw.trim(), match: n, isRemote };
}

/** True if a role title/description looks like an internship or co-op. */
export function looksLikeInternship(text: string): boolean {
  const t = normalize(text);
  return /(^|\b)(intern|internship|co-?op)(\b|s|ship|$)/.test(t);
}

/**
 * Guarantee no em/en dashes in generated text, regardless of what the model does.
 * A spaced dash (clause break) becomes ", "; an unspaced dash (e.g. "3–5") becomes "-".
 */
export function stripDashes(s: string): string {
  if (!s) return "";
  return s
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/[—–]/g, "-");
}

/** Clamp a string to a max length (Notion rich_text caps at 2000 chars per block). */
export function truncate(s: string, max = 1900): string {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

/** Best-effort ISO date (YYYY-MM-DD) from a variety of inputs; null if unparseable. */
export function toIsoDate(input: unknown): string | null {
  if (input == null) return null;
  let d: Date;
  if (typeof input === "number") {
    // Heuristic: seconds vs milliseconds epoch.
    d = new Date(input < 1e12 ? input * 1000 : input);
  } else if (typeof input === "string") {
    const s = input.trim();
    if (!s) return null;
    d = new Date(s);
  } else {
    return null;
  }
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** ISO date (YYYY-MM-DD) for `days` ago from now (UTC). */
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Parse a relative "age" string (as the GitHub lists use: "2d", "3w", "1mo",
 * "5h", "yesterday") into an approximate ISO date. Returns null if it isn't an age.
 */
export function relativeAgeToIso(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const t = input.trim().toLowerCase();
  if (!t) return null;
  if (t === "today" || t === "just posted" || t === "new") return isoDaysAgo(0);
  if (t === "yesterday") return isoDaysAgo(1);
  const m = t.match(/^(\d+)\s*(mo|months?|w|wks?|weeks?|d|days?|h|hrs?|hours?|min(?:ute)?s?|m|y|yrs?|years?)\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  let days: number;
  if (/^mo|^month/.test(unit)) days = n * 30;
  else if (/^w/.test(unit)) days = n * 7;
  else if (/^d/.test(unit)) days = n;
  else if (/^h/.test(unit)) days = 0;
  else if (/^y/.test(unit)) days = n * 365;
  else days = 0; // minutes
  return isoDaysAgo(days);
}

/** Absolute date first, then relative age. Used for the GitHub list date/age columns. */
export function parseDateOrAge(input: unknown): string | null {
  return toIsoDate(input) ?? relativeAgeToIso(input);
}

/** UTF-8 → base64url (no padding). Used for the Gmail RFC-822 raw message. */
export function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Small concurrency-limited map so a scrape run doesn't fire hundreds of subrequests at once. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.max(1, Math.min(limit, items.length))).fill(0).map(async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Constant-time string compare, to avoid leaking a secret via timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Await a delay (used to pace Notion writes under its ~3 req/s limit). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch with a timeout so a single slow board can't stall the whole cron run. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
