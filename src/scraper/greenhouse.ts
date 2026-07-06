import type { RawJob } from "../types";
import { fetchWithTimeout, toIsoDate } from "../util";
import { stripHtml } from "./html";

interface GreenhouseJob {
  title: string;
  absolute_url: string;
  updated_at?: string;
  location?: { name?: string };
  content?: string; // HTML, present when ?content=true
}

/**
 * Pull all public postings for a Greenhouse board token.
 * Public endpoint, no auth: https://boards-api.greenhouse.io/v1/boards/{token}/jobs
 */
export async function fetchGreenhouse(boardToken: string): Promise<RawJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`;
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": "InternOS/0.1 (+https://github.com/internos)" },
  });
  if (!res.ok) {
    // 404 = board token doesn't exist; skip quietly.
    if (res.status !== 404) console.warn(`greenhouse ${boardToken}: HTTP ${res.status}`);
    return [];
  }
  const data = (await res.json()) as { jobs?: GreenhouseJob[] };
  const jobs = data.jobs ?? [];
  return jobs.map((j) => ({
    company: prettifyToken(boardToken),
    role: (j.title ?? "").trim(),
    location: (j.location?.name ?? "").trim(),
    url: j.absolute_url,
    datePosted: toIsoDate(j.updated_at),
    description: stripHtml(decodeMaybe(j.content)),
    source: "greenhouse",
  }));
}

/** Greenhouse sometimes returns HTML-entity-encoded content strings. */
function decodeMaybe(content?: string): string {
  if (!content) return "";
  // The API returns already-escaped HTML; stripHtml handles the common entities.
  return content;
}

function prettifyToken(token: string): string {
  return token
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
