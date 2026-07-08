import type { RawJob } from "../types";
import { fetchWithTimeout, toIsoDate } from "../util";

interface RemotiveJob {
  title: string;
  company_name: string;
  url: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
  job_type?: string;
}

/**
 * Remotive remote-jobs API (no auth), single endpoint filtered to interns:
 * https://remotive.com/api/remote-jobs?search=intern
 * These are remote roles, so the location is labeled "Remote" (any region
 * restriction is appended) which lets them match a Remote location filter.
 */
export async function fetchRemotive(): Promise<RawJob[]> {
  const url = "https://remotive.com/api/remote-jobs?search=intern&limit=80";
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": "InternOS/0.1 (+https://github.com/internos)" },
  });
  if (!res.ok) {
    console.warn(`remotive: HTTP ${res.status}`);
    return [];
  }
  const data = (await res.json()) as { jobs?: RemotiveJob[] };
  return (data.jobs ?? []).map((j) => ({
    company: (j.company_name ?? "").trim(),
    role: (j.title ?? "").trim(),
    location: j.candidate_required_location ? `Remote - ${j.candidate_required_location}` : "Remote",
    url: j.url ?? "",
    datePosted: toIsoDate(j.publication_date),
    description: (j.description ?? "").slice(0, 3000),
    salary: (j.salary ?? "").trim(),
    source: "remotive",
  }));
}
