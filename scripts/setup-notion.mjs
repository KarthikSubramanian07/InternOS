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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEnv, must } from "./_env.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, "../config/notion-schema.json"), "utf8"));
const categories = JSON.parse(readFileSync(join(here, "../config/categories.json"), "utf8"));

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

const P = schema.properties;
const FALLBACK_COLORS = ["blue", "purple", "green", "orange", "pink", "brown", "red", "yellow"];

// Category options come from categories.json keys (+ "Other"), colored from the schema.
const categoryNames = [...Object.keys(categories), "Other"];
const categoryOptions = categoryNames.map((name, i) => ({
  name,
  color: schema.categoryColors[name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
}));

// Property display order = insertion order (Notion has no API to reorder later).
// Ordered for a human workflow: identify the role → see when/where/status →
// take the apply action → read the generated drafts → metadata last.
const properties = {
  [P.company]: { title: {} }, // title must be first
  [P.role]: { rich_text: {} },
  [P.category]: { select: { options: categoryOptions } },
  [P.location]: { rich_text: {} },
  [P.datePosted]: { date: {} },
  [P.status]: { select: { options: schema.statusOptions } },
  [P.apply]: { checkbox: {} },
  [P.link]: { url: {} },
  [P.resumeDraft]: { rich_text: {} },
  [P.coverLetterDraft]: { rich_text: {} },
  [P.recruiterEmailDraft]: { rich_text: {} },
  [P.gmailDraftLink]: { url: {} },
  [P.source]: { select: { options: schema.sourceOptions } },
  [P.description]: { rich_text: {} },
};

const body = {
  parent: { type: "page_id", page_id: parentPageId },
  icon: { type: "emoji", emoji: "🎯" },
  title: [{ type: "text", text: { content: schema.databaseTitle } }],
  description: [
    {
      type: "text",
      text: {
        content:
          "Auto-updated internship tracker. Tick Apply ✅ on a row to generate a tailored resume, cover letter, and recruiter email. Tip: group by Status for a Kanban board, and hide 'Job Description' in your main views.",
      },
    },
  ],
  properties,
};

const res = await fetch("https://api.notion.com/v1/databases", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  },
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
