import type { RawJob } from "../types";
import { fetchWithTimeout, toIsoDate } from "../util";
import { parseSalary } from "./salary";

interface RCOffer {
  title: string;
  location?: string;
  city?: string;
  careers_url?: string;
  url?: string;
  created_at?: string;
  description?: string;
}

/**
 * Recruitee public offers API (no auth):
 * https://{company}.recruitee.com/api/offers/
 */
export async function fetchRecruitee(company: string): Promise<RawJob[]> {
  const url = `https://${encodeURIComponent(company)}.recruitee.com/api/offers/`;
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": "InternOS/0.1 (+https://github.com/internos)" },
  });
  if (!res.ok) {
    if (res.status !== 404) console.warn(`recruitee ${company}: HTTP ${res.status}`);
    return [];
  }
  const data = (await res.json()) as { offers?: RCOffer[] };
  return (data.offers ?? []).map((o) => ({
    company: prettify(company),
    role: (o.title ?? "").trim(),
    location: (o.location || o.city || "").trim(),
    url: o.careers_url || o.url || "",
    datePosted: toIsoDate(o.created_at),
    description: (o.description || "").slice(0, 3000),
    salary: parseSalary(o.description),
    source: "recruitee",
  }));
}

function prettify(token: string): string {
  return token.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
