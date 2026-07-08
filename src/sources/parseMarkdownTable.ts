import type { RawJob } from "../types";
import { fetchWithTimeout, parseDateOrAge } from "../util";

/**
 * The internship-list repos use three different layouts:
 *   - SimplifyJobs / vanshb03 : HTML <table> with Company | Role | Location | Apply | Age,
 *     using <td>↳</td> for "same company as the row above".
 *   - speedyapply            : GitHub-markdown pipe tables (Company | Position | ... | Posting | Age).
 *   - northwesternfintech    : pipe tables of `Role | Links`, with the company in a
 *                              `## Heading` and location in a `**Locations**:` line above.
 *
 * We run both a pipe-table parser and an HTML-table parser over each document and
 * concatenate; dedupe downstream collapses any overlap. Per-repo modules just supply
 * the raw URL(s), a source label, and an optional category hint.
 */

export interface RepoSource {
  source: string;
  rawUrls: string[];
  categoryHint?: string;
}

const CONTINUATION = new Set(["↳", "⤷", "->", "→", "«", "same", ""]);

export async function fetchRepoSource(repo: RepoSource): Promise<RawJob[]> {
  const chunks: string[] = [];
  for (const url of repo.rawUrls) {
    try {
      const res = await fetchWithTimeout(url, {
        headers: { "User-Agent": "InternOS/0.1 (+https://github.com/internos)" },
      });
      if (res.ok) chunks.push(await res.text());
      else if (res.status !== 404) console.warn(`${repo.source} ${url}: HTTP ${res.status}`);
    } catch (err) {
      console.warn(`${repo.source} ${url}: ${(err as Error).message}`);
    }
  }
  return parseJobsFromMarkdown(chunks.join("\n\n"), repo);
}

export function parseJobsFromMarkdown(markdown: string, repo: RepoSource): RawJob[] {
  return [...parsePipeTables(markdown, repo), ...parseHtmlTables(markdown, repo)];
}

interface ColumnMap {
  company: number;
  role: number;
  location: number;
  link: number;
  date: number;
  salary: number;
}

// --- Markdown pipe tables (speedyapply, northwesternfintech) -----------------

function parsePipeTables(markdown: string, repo: RepoSource): RawJob[] {
  const lines = markdown.split(/\r?\n/);
  const jobs: RawJob[] = [];

  let cols: ColumnMap | null = null;
  let lastCompany = "";
  let lastHeading = ""; // used as company when the table has no company column
  let sectionLocation = ""; // used as location when the table has no location column

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/);
    if (heading) lastHeading = cleanText(heading[1]);
    const loc = line.match(/^\s*\*\*locations?\*\*\s*:?\s*(.+)$/i);
    if (loc) sectionLocation = cleanText(loc[1]);

    if (!line.includes("|")) {
      cols = null;
      continue;
    }
    const cells = splitPipeRow(line);
    if (cells.length < 2) {
      cols = null;
      continue;
    }

    // Header row = one immediately followed by a --- separator.
    if (!cols && isSeparator(lines[i + 1] ?? "")) {
      cols = mapColumns(cells);
      lastCompany = "";
      continue;
    }
    if (isSeparator(line) || !cols) continue;
    if (/🔒|🚫|closed/i.test(line)) continue;

    // Resolve company: from its column (with ↳-continuation), or the last heading.
    let company: string;
    if (cols.company === -1) {
      company = lastHeading;
    } else {
      const raw = cellAt(cells, cols.company);
      company = CONTINUATION.has(raw.trim()) ? lastCompany : cleanCompany(raw);
      if (company) lastCompany = company;
    }

    const role = cleanText(cellAt(cells, cols.role));
    const location =
      cols.location !== -1
        ? cleanText(cellAt(cells, cols.location)).replace(/<\/?br\s*\/?>/gi, "; ")
        : sectionLocation;
    const url =
      extractUrl(cellAt(cells, cols.link)) ||
      extractUrl(cellAt(cells, cols.role)) ||
      (cols.company !== -1 ? extractUrl(cellAt(cells, cols.company)) : "") ||
      "";
    const datePosted = cols.date !== -1 ? parseDateOrAge(cleanText(cellAt(cells, cols.date))) : null;
    const salary = cols.salary !== -1 ? cleanText(cellAt(cells, cols.salary)) : "";

    if (!company || !role || !url) continue;
    jobs.push({ company, role, location, url, datePosted, salary, source: repo.source, categoryHint: repo.categoryHint });
  }
  return jobs;
}

// --- HTML tables (SimplifyJobs, vanshb03) ------------------------------------

function parseHtmlTables(markdown: string, repo: RepoSource): RawJob[] {
  const jobs: RawJob[] = [];
  let headerCols: ColumnMap | null = null;
  let lastCompany = "";

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(markdown))) {
    const rowHtml = m[1];
    const isHeader = /<th[\s>]/i.test(rowHtml);
    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1]);
    if (!cells.length) continue;

    if (isHeader) {
      headerCols = mapColumns(cells.map(cleanText));
      lastCompany = "";
      continue;
    }
    if (/🔒|🚫|closed/i.test(rowHtml)) continue;

    const cols = headerCols ?? positionalCols(cells);
    const rawCompanyCell = cells[cols.company] ?? "";
    const companyText = cleanCellHtml(rawCompanyCell);
    const company =
      CONTINUATION.has(companyText) || companyText === "" ? lastCompany : companyText;
    if (company) lastCompany = company;

    const role = cleanCellHtml(cells[cols.role] ?? "");
    const location = cleanCellHtml(cells[cols.location] ?? "");
    const url = extractUrl(cells[cols.link] ?? "") || extractUrl(rawCompanyCell) || "";
    const datePosted = parseDateOrAge(cleanCellHtml(cells[cols.date] ?? ""));
    const salary = cols.salary !== -1 ? cleanCellHtml(cells[cols.salary] ?? "") : "";

    if (!company || !role || !url) continue;
    jobs.push({ company, role, location, url, datePosted, salary, source: repo.source, categoryHint: repo.categoryHint });
  }
  return jobs;
}

/** Positional map for a header-less HTML row: Company | Role | Location | Apply | Age. */
function positionalCols(cells: string[]): ColumnMap {
  const applyIdx = cells.findIndex((c) => /href\s*=/i.test(c) && /<img/i.test(c));
  const n = cells.length;
  return {
    company: 0,
    role: 1,
    location: 2,
    link: applyIdx !== -1 ? applyIdx : Math.max(1, n - 2),
    date: n - 1,
    salary: -1,
  };
}

// --- shared helpers ----------------------------------------------------------

function mapColumns(headers: string[]): ColumnMap {
  const norm = headers.map((h) => cleanText(h).toLowerCase());
  const find = (re: RegExp) => norm.findIndex((h) => re.test(h));
  const company = find(/company|name|organization|employer/);
  const role = find(/role|position|title/);
  const link = find(/application|apply|link|posting|url/);
  return {
    company,
    role: role !== -1 ? role : company !== -1 ? company + 1 : 0,
    location: find(/location|loc\b|city|region/),
    link: link !== -1 ? link : Math.max(0, headers.length - 2),
    date: find(/date|posted|age/),
    salary: find(/salary|compensation|\bpay\b|\bcomp\b/),
  };
}

function splitPipeRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]*-[-\s:|]*\|?\s*$/.test(line) && line.includes("-");
}

function cellAt(cells: string[], idx: number): string {
  return idx >= 0 && idx < cells.length ? cells[idx] : "";
}

function extractUrl(cell: string): string {
  if (!cell) return "";
  const href = cell.match(/href\s*=\s*["']([^"']+)["']/i);
  if (href) return sanitizeUrl(href[1]);
  const md = cell.match(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
  if (md) return sanitizeUrl(md[1]);
  const bare = cell.match(/https?:\/\/[^\s)|<>"']+/);
  if (bare) return sanitizeUrl(bare[0]);
  return "";
}

function sanitizeUrl(u: string): string {
  try {
    const url = new URL(u);
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_|^ref$|^gh_src$|^gh_jid$/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return u;
  }
}

function cleanCompany(cell: string): string {
  return cleanText(cell)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .trim();
}

function cleanCellHtml(cell: string): string {
  return cleanText(cell.replace(/<summary>[\s\S]*?<\/summary>/gi, "").replace(/<br\s*\/?>/gi, "; "));
}

/** Strip markdown/HTML noise from a cell, keeping human-readable text. */
function cleanText(cell: string): string {
  if (!cell) return "";
  return cell
    .replace(/<img[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[🔒🎓🛂🇺🇸➕]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
