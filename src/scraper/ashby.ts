import type { RawJob } from "../types";
import { fetchWithTimeout, toIsoDate } from "../util";
import { parseSalary } from "./salary";

interface AshbyJob {
  title: string;
  location?: string;
  workplaceType?: string; // "Remote" | "Hybrid" | "OnSite"
  jobUrl?: string;
  applyUrl?: string;
  publishedAt?: string;
  employmentType?: string;
  isListed?: boolean;
  compensationTierSummary?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
}

/**
 * Pull all public postings for an Ashby job board.
 * Public endpoint, no auth: https://api.ashbyhq.com/posting-api/job-board/{name}
 */
export async function fetchAshby(boardName: string): Promise<RawJob[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardName)}?includeCompensation=true`;
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
    // Fully-remote → "Remote"; hybrid/on-site keep the city (hybrid = in-person).
    location: j.workplaceType === "Remote" ? "Remote" : (j.location ?? "").trim(),
    url: j.jobUrl ?? j.applyUrl ?? "",
    datePosted: toIsoDate(j.publishedAt),
    // Raw text/HTML, truncated; cleaned at Notion-write time only.
    description: (j.descriptionPlain || j.descriptionHtml || "").slice(0, 3000),
    salary: j.compensationTierSummary?.trim() || parseSalary(j.descriptionPlain || j.descriptionHtml),
    source: "ashby",
  }));
}

function prettify(token: string): string {
  return token.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
