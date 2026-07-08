import type { Env } from "./types";
import { NotionClient } from "./notion/client";
import { P } from "./notion/schema";
import { setBoostedCategories } from "./storage";

const DAY_MS = 86400000;

/** Paginate a Notion database query, bounded to keep subrequests in check. */
async function queryAll(
  notion: NotionClient,
  dbId: string,
  filter: unknown | undefined,
  maxPages = 6,
): Promise<any[]> {
  const rows: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const res: any = await notion.queryDatabase(dbId, filter, 100, cursor);
    rows.push(...(res.results ?? []));
    if (!res.has_more) break;
    cursor = res.next_cursor;
  }
  return rows;
}

function text(prop: any): string {
  const arr = prop?.title ?? prop?.rich_text;
  return Array.isArray(arr) ? arr.map((t: any) => t.plain_text ?? "").join("") : "";
}

export interface Stats {
  total: number;
  byStatus: Record<string, number>;
  appliedTotal: number;
  interviewRate: number;
  offerRate: number;
  staleApplied: string[];
}

/** Funnel + rates + a list of "Applied >14d ago, no movement" rows (aging). */
export async function computeStats(env: Env): Promise<Stats> {
  const notion = new NotionClient(env.NOTION_TOKEN);
  const rows = await queryAll(notion, env.NOTION_DATABASE_ID, undefined);

  const byStatus: Record<string, number> = {};
  const staleApplied: string[] = [];
  const now = Date.now();

  for (const p of rows) {
    const st = p.properties?.[P.status]?.select?.name ?? "Unknown";
    byStatus[st] = (byStatus[st] ?? 0) + 1;
    if (st === "Applied" && p.last_edited_time) {
      const age = now - new Date(p.last_edited_time).getTime();
      if (age > 14 * DAY_MS) {
        const label = `${text(p.properties?.[P.company])} — ${text(p.properties?.[P.role])}`.trim();
        if (staleApplied.length < 25) staleApplied.push(label);
      }
    }
  }

  const applied = (byStatus["Applied"] ?? 0) + (byStatus["Interview"] ?? 0) + (byStatus["Offer"] ?? 0) + (byStatus["Rejected"] ?? 0);
  const interviews = (byStatus["Interview"] ?? 0) + (byStatus["Offer"] ?? 0);
  const offers = byStatus["Offer"] ?? 0;

  return {
    total: rows.length,
    byStatus,
    appliedTotal: applied,
    interviewRate: applied ? +(interviews / applied).toFixed(3) : 0,
    offerRate: applied ? +(offers / applied).toFixed(3) : 0,
    staleApplied,
  };
}

/**
 * Outcome-driven recalibration: categories that reached Interview/Offer become
 * "boosted" so similar roles rank higher on future scrapes. Persists to KV.
 */
export async function refreshBoosts(env: Env): Promise<string[]> {
  const notion = new NotionClient(env.NOTION_TOKEN);
  const filter = {
    or: [
      { property: P.status, select: { equals: "Interview" } },
      { property: P.status, select: { equals: "Offer" } },
    ],
  };
  const rows = await queryAll(notion, env.NOTION_DATABASE_ID, filter, 2);
  const cats = new Set<string>();
  for (const p of rows) {
    const c = p.properties?.[P.category]?.select?.name;
    if (c) cats.add(c);
  }
  const boosted = [...cats];
  await setBoostedCategories(env.JOBS, boosted);
  return boosted;
}
