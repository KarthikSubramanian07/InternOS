import type { Env } from "./types";
import { NotionClient } from "./notion/client";
import { P } from "./notion/schema";
import { draftWithGuard } from "./webhook/handler";

/**
 * Poll fallback for drafting — makes the Notion "Send webhook" automation
 * OPTIONAL (that action can require a paid Notion plan). A frequent cron finds
 * rows where Apply ✅ is checked but the Resume Draft is still empty, and drafts
 * them. Idempotent: once drafts are written the row no longer matches the filter.
 */
export async function pollPendingDrafts(env: Env): Promise<string> {
  if (!env.NOTION_TOKEN || !env.NOTION_DATABASE_ID) {
    return "poll skipped: Notion not configured";
  }
  const notion = new NotionClient(env.NOTION_TOKEN);

  // Cap per poll so a burst of checked rows can't blow the subrequest budget;
  // leftovers are picked up on the next poll.
  const filter = {
    and: [
      { property: P.apply, checkbox: { equals: true } },
      { property: P.resumeDraft, rich_text: { is_empty: true } },
    ],
  };

  let result: any;
  try {
    result = await notion.queryDatabase(env.NOTION_DATABASE_ID, filter, 8);
  } catch (err) {
    console.error("poll query failed:", (err as Error).message);
    return `poll query failed: ${(err as Error).message}`;
  }

  const pages: any[] = result.results ?? [];
  if (!pages.length) return "poll: nothing pending";

  let drafted = 0;
  let skipped = 0;
  let failed = 0;
  for (const page of pages) {
    const outcome = await draftWithGuard(env, page.id);
    if (outcome === "drafted") drafted++;
    else if (outcome === "skipped") skipped++;
    else failed++;
  }

  const summary = `poll: ${pages.length} pending → drafted=${drafted}, skipped=${skipped}, failed=${failed}`;
  console.log(summary);
  return summary;
}
