#!/usr/bin/env node
/**
 * Create the InternOS Notion database with a clean, well-organized schema:
 * colored Category / Status / Source selects, an Apply checkbox, and draft
 * fields. Run once:  npm run setup:notion
 *
 * Prereqs (see README):
 *   - NOTION_TOKEN in .env (internal integration token)
 *   - NOTION_PARENT_PAGE_ID in .env, OR pass it as the first arg — a Notion page
 *     you've shared with the integration; the database is created inside it.
 */
import { loadEnv, must } from "./_env.mjs";
import { P, schema, orderedColumns, ICON, DESCRIPTION, notionHeaders } from "./_notion-schema.mjs";

const env = loadEnv();
const token = must(env, "NOTION_TOKEN", "Create an internal integration at https://www.notion.so/my-integrations");
const parentPageId = (process.argv[2] || env.NOTION_PARENT_PAGE_ID || "").trim();
if (!parentPageId) {
  console.error(
    "\n✖ Need a parent page id. Share a Notion page with your integration, then:\n" +
      "   npm run setup:notion <PARENT_PAGE_ID>\n" +
      "  (or set NOTION_PARENT_PAGE_ID in .env)\n",
  );
  process.exit(1);
}

// Title (Company) must be first; the rest follow the shared intuitive order.
const properties = { [P.company]: { title: {} }, ...Object.fromEntries(orderedColumns()) };

const body = {
  parent: { type: "page_id", page_id: parentPageId },
  icon: ICON,
  title: [{ type: "text", text: { content: schema.databaseTitle } }],
  description: DESCRIPTION,
  properties,
};

const res = await fetch("https://api.notion.com/v1/databases", {
  method: "POST",
  headers: notionHeaders(token),
  body: JSON.stringify(body),
});

const data = await res.json();
if (!res.ok) {
  console.error("\n✖ Notion database creation failed:\n", JSON.stringify(data, null, 2));
  if (data?.code === "object_not_found") {
    console.error(
      "\nMake sure you shared the parent page with your integration:\n" +
        "  open the page → ••• → Connections → add your integration.\n",
    );
  }
  process.exit(1);
}

const dbId = data.id.replace(/-/g, "");
console.log("\n✅ Created database:", schema.databaseTitle);
console.log("   Database ID:", dbId);
console.log("   URL:", data.url);
console.log("\nSet it as a Worker secret (and locally in .env):\n");
console.log("   wrangler secret put NOTION_DATABASE_ID   # paste:", dbId);
console.log("\n💡 Recommended views (create these manually in Notion for the nicest dashboard):");
console.log("   • Board grouped by Status  → drag cards Not Applied → Applied → Interview → Offer");
console.log("   • Table grouped by Category, sorted by Date Posted (newest first)");
console.log("   • Filter: Apply ✅ = checked  → your active outreach queue");
console.log("   • Hide the 'Job Description' column in your main views to keep it tidy.\n");
