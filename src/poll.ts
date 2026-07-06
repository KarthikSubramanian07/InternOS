import type { Env } from "./types";
import { NotionClient } from "./notion/client";
import { P } from "./notion/schema";
import { draftWithGuard } from "./webhook/handler";
import { sleep } from "./util";

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

  // 1) Remove rows the user dismissed (Dismiss ❌ checked) — archive to trash.
  let dismissed = 0;
  try {
    const dq = await notion.queryDatabase(
      env.NOTION_DATABASE_ID,
      { property: P.dismiss, checkbox: { equals: true } },
      15,
    );
    for (const page of dq.results ?? []) {
      try {
        await notion.archivePage(page.id);
        dismissed++;
        await sleep(340); // pace under Notion's ~3 req/s limit
      } catch (err) {
        console.warn("archive failed:", (err as Error).message);
      }
    }
  } catch (err) {
    console.warn("dismiss query failed:", (err as Error).message);
  }

  // 2) Draft rows where Apply ✅ is checked but the Resume Draft is still empty.
  // Cap per poll so a burst can't blow the subrequest budget; the rest come next poll.
  let drafted = 0;
  let skipped = 0;
  let failed = 0;
  let pending = 0;
  try {
    const result = await notion.queryDatabase(
      env.NOTION_DATABASE_ID,
      {
        and: [
          { property: P.apply, checkbox: { equals: true } },
          { property: P.resumeDraft, rich_text: { is_empty: true } },
        ],
      },
      8,
    );
    const pages: any[] = result.results ?? [];
    pending = pages.length;
    for (const page of pages) {
      const outcome = await draftWithGuard(env, page.id);
      if (outcome === "drafted") drafted++;
      else if (outcome === "skipped") skipped++;
      else failed++;
    }
  } catch (err) {
    console.error("poll draft query failed:", (err as Error).message);
  }

  const summary = `poll: dismissed=${dismissed}, pending=${pending} → drafted=${drafted}, skipped=${skipped}, failed=${failed}`;
  console.log(summary);
  return summary;
}
