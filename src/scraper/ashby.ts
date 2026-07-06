import type { RawJob } from "../types";
import { fetchWithTimeout, toIsoDate } from "../util";
import { stripHtml } from "./html";

interface AshbyJob {
  title: string;
  location?: string;
  jobUrl?: string;
  applyUrl?: string;
  publishedAt?: string;
  employmentType?: string;
  isListed?: boolean;
  descriptionPlain?: string;
  descriptionHtml?: string;
}

/**
 * Pull all public postings for an Ashby job board.
 * Public endpoint, no auth: https://api.ashbyhq.com/posting-api/job-board/{name}
 */
export async function fetchAshby(boardName: string): Promise<RawJob[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardName)}?includeCompensation=false`;
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": "InternOS/0.1 (+https://github.com/internos)" },
  });
  if (!res.ok) {
    if (res.status !== 404) console.warn(`ashby ${boardName}: HTTP ${res.status}`);
    return [];
  }
  const data = (await res.json()) as { jobs?: AshbyJob[] };
  const jobs = (data.jobs ?? []).filter((j) => j.isListed !== false);
  return jobs.map((j) => ({
    company: prettify(boardName),
    role: (j.title ?? "").trim(),
    location: (j.location ?? "").trim(),
    url: j.jobUrl ?? j.applyUrl ?? "",
    datePosted: toIsoDate(j.publishedAt),
    description: j.descriptionPlain?.trim() || stripHtml(j.descriptionHtml),
    source: "ashby",
  }));
}

function prettify(token: string): string {
  return token.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
