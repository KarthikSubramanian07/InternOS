import type { RawJob } from "../types";
import { fetchWithTimeout, toIsoDate } from "../util";

interface SRPosting {
  id: string;
  name: string;
  releasedDate?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
}

/**
 * SmartRecruiters public postings API (no auth):
 * https://api.smartrecruiters.com/v1/companies/{company}/postings
 * The list endpoint has no description/salary, so those stay empty.
 */
export async function fetchSmartRecruiters(company: string): Promise<RawJob[]> {
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?limit=100`;
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": "InternOS/0.1 (+https://github.com/internos)" },
  });
  if (!res.ok) {
    if (res.status !== 404) console.warn(`smartrecruiters ${company}: HTTP ${res.status}`);
    return [];
  }
  const data = (await res.json()) as { content?: SRPosting[] };
  return (data.content ?? []).map((p) => ({
    company: prettify(company),
    role: (p.name ?? "").trim(),
    location: p.location?.remote
      ? "Remote"
      : [p.location?.city, p.location?.region].filter(Boolean).join(", "),
    url: `https://jobs.smartrecruiters.com/${company}/${p.id}`,
    datePosted: toIsoDate(p.releasedDate),
    description: "",
    salary: "",
    source: "smartrecruiters",
  }));
}

function prettify(token: string): string {
  return token.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
