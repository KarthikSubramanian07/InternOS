import type { Job } from "./types";

/** Lowercase + collapse whitespace, for keyword matching. */
export function normalize(s: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Stable dedupe key for a job: company + role + url. Uses a fast synchronous
 * hash (not crypto) — dedupe needs no cryptographic strength, and hashing many
 * thousands of scraped rows with crypto.subtle would eat the Worker CPU budget.
 * Two FNV-1a passes with different seeds give a 16-hex, low-collision key.
 */
export function hashJob(job: Pick<Job, "company" | "role" | "url">): string {
  const basis = [normalize(job.company), normalize(job.role), normalize(job.url)].join("|");
  return fnv1a(basis, 0x811c9dc5) + fnv1a(basis, 0x01000193);
}

function fnv1a(str: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** True if a role title/description looks like an internship or co-op. */
export function looksLikeInternship(text: string): boolean {
  const t = normalize(text);
  return /(^|\b)(intern|internship|co-?op)(\b|s|ship|$)/.test(t);
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
