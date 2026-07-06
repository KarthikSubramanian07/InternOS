#!/usr/bin/env node
/**
 * Configure an EXISTING (user-created) Notion database into the InternOS schema.
 * Use this when you want a standalone, top-level database: create a blank
 * full-page database in Notion, share it with your integration, then run:
 *
 *   node scripts/configure-notion.mjs <DATABASE_URL_or_ID>
 *
 * It renames the title column to "Company", removes default columns, and adds
 * all InternOS columns in a human-intuitive order (colored selects, checkboxes).
 * Properties are added one at a time so the column order is deterministic.
 */
import { loadEnv, must } from "./_env.mjs";
import { P, orderedColumns, ICON, DESCRIPTION, notionHeaders } from "./_notion-schema.mjs";

const env = loadEnv();
const token = must(env, "NOTION_TOKEN", "Create an integration at notion.so/my-integrations");
const arg = (process.argv[2] || env.NOTION_DATABASE_ID || "").trim();
// Accept both a plain 32-hex id and a dashed 8-4-4-4-12 UUID (from a URL or the API).
const idMatch = arg.match(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i);
if (!idMatch) {
  console.error("\n✖ Pass the database URL or id:\n   node scripts/configure-notion.mjs <DATABASE_URL_or_ID>\n");
  process.exit(1);
}
const id = idMatch[0].replace(/-/g, "");
const H = notionHeaders(token);

async function patch(body, label) {
  const res = await fetch(`https://api.notion.com/v1/databases/${id}`, { method: "PATCH", headers: H, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) {
    console.error(`\n✖ ${label} failed:`, JSON.stringify(j).slice(0, 300));
    if (j.code === "object_not_found") console.error("  → Share the database with your integration: ••• → Connections → add it.\n");
    process.exit(1);
  }
  return j;
}

// Read current schema.
const res = await fetch(`https://api.notion.com/v1/databases/${id}`, { headers: H });
const db = await res.json();
if (!res.ok) {
  console.error("\n✖ Cannot read database:", JSON.stringify(db).slice(0, 200));
  if (db.code === "object_not_found") console.error("  → Share it with your integration first (••• → Connections).\n");
  process.exit(1);
}
const titleName = Object.entries(db.properties).find(([, p]) => p.type === "title")?.[0];

// 1) Rename title → Company, and delete every other existing (default) column.
const reset = {};
if (titleName && titleName !== P.company) reset[titleName] = { name: P.company };
for (const [name, p] of Object.entries(db.properties)) {
  if (p.type !== "title") reset[name] = null;
}
if (Object.keys(reset).length) await patch({ properties: reset }, "reset defaults");

// 2) Add our columns one at a time, in intuitive order (shared with setup-notion).
for (const [name, def] of orderedColumns()) {
  await patch({ properties: { [name]: def } }, `add ${name}`);
  process.stdout.write(".");
}

// 3) Icon + description.
await patch({ icon: ICON, description: DESCRIPTION }, "icon+description");

console.log("\n\n✅ Configured database", id);
console.log("Now point the Worker at it:\n   wrangler secret put NOTION_DATABASE_ID   # paste:", id, "\n");
