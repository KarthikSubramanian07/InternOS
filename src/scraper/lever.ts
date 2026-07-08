import type { RawJob } from "../types";
import { fetchWithTimeout, toIsoDate } from "../util";
import { formatRange, parseSalary } from "./salary";

interface LeverPosting {
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  categories?: { location?: string; team?: string; commitment?: string };
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
  descriptionPlain?: string;
  description?: string; // HTML
}

/**
 * Pull all public postings for a Lever company.
 * Public endpoint, no auth: https://api.lever.co/v0/postings/{company}?mode=json
 */
export async function fetchLever(company: string): Promise<RawJob[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`;
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": "InternOS/0.1 (+https://github.com/internos)" },
  });
  if (!res.ok) {
    if (res.status !== 404) console.warn(`lever ${company}: HTTP ${res.status}`);
    return [];
  }
  const postings = (await res.json()) as LeverPosting[];
  if (!Array.isArray(postings)) return [];
  return postings.map((p) => ({
    company: prettify(company),
    role: (p.text ?? "").trim(),
    location: (p.categories?.location ?? "").trim(),
    url: p.hostedUrl ?? p.applyUrl ?? "",
    datePosted: toIsoDate(p.createdAt),
    // Raw text/HTML, truncated; cleaned at Notion-write time only.
    description: (p.descriptionPlain || p.description || "").slice(0, 3000),
    salary: formatRange(p.salaryRange) || parseSalary(p.descriptionPlain || p.description),
    source: "lever",
  }));
}

function prettify(token: string): string {
  return token.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
