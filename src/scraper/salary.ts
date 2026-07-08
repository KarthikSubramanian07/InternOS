/**
 * Best-effort compensation extractor. Boards that expose structured pay (Ashby,
 * Lever) pass it directly; for the rest we scrape a salary-looking substring out
 * of the posting text. Returns "" when nothing salary-like is found.
 */
const SALARY_RE =
  /\$\s?\d[\d,]*(?:\.\d+)?\s?[kK]?(?:\s?(?:-|–|—|to)\s?\$?\s?\d[\d,]*(?:\.\d+)?\s?[kK]?)?(?:\s?(?:\/|per\b)\s?(?:hr|hour|yr|year|annum|month|mo|wk|week))?/;

export function parseSalary(text: string | null | undefined): string {
  if (!text) return "";
  const m = text.match(SALARY_RE);
  return m ? m[0].replace(/\s+/g, " ").trim() : "";
}

/** Format a structured salary range (Lever-style) into a compact string. */
export function formatRange(range?: {
  min?: number;
  max?: number;
  currency?: string;
  interval?: string;
}): string {
  if (!range || (range.min == null && range.max == null)) return "";
  const cur = range.currency === "USD" || !range.currency ? "$" : `${range.currency} `;
  const n = (v?: number) => (v == null ? "" : `${cur}${v.toLocaleString("en-US")}`);
  const span = range.min != null && range.max != null ? `${n(range.min)} - ${n(range.max)}` : n(range.min ?? range.max);
  const per = range.interval ? `/${range.interval.replace(/^per-?/, "")}` : "";
  return `${span}${per}`.trim();
}
