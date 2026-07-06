import type { DraftResult, Job } from "../types";
import { fetchWithTimeout, truncate } from "../util";
import { P, platformLabel } from "./schema";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/** Thin Notion REST client (raw fetch — no SDK, so it bundles cleanly on Workers). */
export class NotionClient {
  constructor(private token: string) {}

  private async request<T = any>(path: string, method: string, body?: unknown): Promise<T> {
    const res = await fetchWithTimeout(
      `${NOTION_API}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      },
      20000,
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion ${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
    }
    return res.json() as Promise<T>;
  }

  createPage(databaseId: string, properties: Record<string, unknown>): Promise<any> {
    return this.request("/pages", "POST", { parent: { database_id: databaseId }, properties });
  }

  updatePage(pageId: string, properties: Record<string, unknown>): Promise<any> {
    return this.request(`/pages/${pageId}`, "PATCH", { properties });
  }

  getPage(pageId: string): Promise<any> {
    return this.request(`/pages/${encodeURIComponent(pageId)}`, "GET");
  }

  queryDatabase(databaseId: string, filter: unknown, pageSize = 25): Promise<any> {
    return this.request(`/databases/${encodeURIComponent(databaseId)}/query`, "POST", {
      filter,
      page_size: pageSize,
    });
  }
}

// --- Property value builders -------------------------------------------------

/** Notion caps each rich_text item at 2000 chars — chunk long strings. */
function richTextChunks(s: string): Array<{ text: { content: string } }> {
  if (!s) return [];
  const chunkSize = 1900;
  const out: Array<{ text: { content: string } }> = [];
  for (let i = 0; i < s.length && out.length < 90; i += chunkSize) {
    out.push({ text: { content: s.slice(i, i + chunkSize) } });
  }
  return out;
}

export const val = {
  title: (s: string) => ({ title: [{ text: { content: truncate(s, 1900) } }] }),
  richText: (s: string) => ({ rich_text: richTextChunks(s) }),
  select: (name: string | null) => ({ select: name ? { name } : null }),
  url: (u: string | null) => ({ url: u || null }),
  date: (iso: string | null) => ({ date: iso ? { start: iso } : null }),
  checkbox: (b: boolean) => ({ checkbox: !!b }),
};

/** Build the `properties` payload to create a new job row. */
export function jobToCreateProperties(job: Job): Record<string, unknown> {
  return {
    [P.company]: val.title(job.company),
    [P.role]: val.richText(job.role),
    [P.category]: val.select(job.category || "Other"),
    [P.location]: val.richText(job.location),
    [P.link]: val.url(job.url),
    [P.source]: val.select(platformLabel(job.source)),
    [P.datePosted]: val.date(job.datePosted),
    [P.status]: val.select("Not Applied"),
    [P.apply]: val.checkbox(false),
    [P.description]: val.richText(truncate(job.description ?? "", 1900)),
  };
}

/** Build the `properties` payload to write drafts back into a row. */
export function draftsToUpdateProperties(input: {
  drafts: DraftResult;
  gmailDraftLink?: string | null;
}): Record<string, unknown> {
  const { drafts, gmailDraftLink } = input;
  const bullets = drafts.resume_bullets.map((b) => `• ${b}`).join("\n");
  const email = `Subject: ${drafts.recruiter_email.subject}\n\n${drafts.recruiter_email.body}`;
  const props: Record<string, unknown> = {
    [P.resumeDraft]: val.richText(bullets),
    [P.coverLetterDraft]: val.richText(drafts.cover_letter),
    [P.recruiterEmailDraft]: val.richText(email),
  };
  if (gmailDraftLink) props[P.gmailDraftLink] = val.url(gmailDraftLink);
  return props;
}

// --- Reading a page back (webhook side) --------------------------------------

function plainText(prop: any): string {
  if (!prop) return "";
  const arr = prop.title ?? prop.rich_text;
  if (Array.isArray(arr)) return arr.map((t: any) => t.plain_text ?? t.text?.content ?? "").join("");
  return "";
}

export interface PageJob {
  company: string;
  role: string;
  location: string;
  url: string;
  category: string;
  description: string;
  applyChecked: boolean;
}

/** Extract the fields we need for drafting from a fetched Notion page. */
export function readJobFromPage(page: any): PageJob {
  const props = page?.properties ?? {};
  return {
    company: plainText(props[P.company]),
    role: plainText(props[P.role]),
    location: plainText(props[P.location]),
    url: props[P.link]?.url ?? "",
    category: props[P.category]?.select?.name ?? "",
    description: plainText(props[P.description]),
    applyChecked: !!props[P.apply]?.checkbox,
  };
}
