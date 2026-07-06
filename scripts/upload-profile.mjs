#!/usr/bin/env node
/**
 * Upload your private-config.json to Cloudflare KV under the key "profile".
 * The Worker reads it at scrape + drafting time. Run:  npm run setup:profile
 *
 * Your profile never touches the repo — it lives only in your KV namespace.
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FILE = process.argv[2] || "private-config.json";

if (!existsSync(FILE)) {
  console.error(
    `\n✖ ${FILE} not found.\n  Copy the example and fill it in:\n     cp private-config.example.json private-config.json\n`,
  );
  process.exit(1);
}

let profile;
try {
  profile = JSON.parse(readFileSync(FILE, "utf8"));
} catch (err) {
  console.error(`\n✖ ${FILE} is not valid JSON:`, err.message, "\n");
  process.exit(1);
}

// Minimal validation against the required fields in config.schema.json.
const missing = ["name", "resumeText", "targetCategories"].filter((k) => {
  const v = profile[k];
  return v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");
});
if (missing.length) {
  console.error(`\n✖ ${FILE} is missing required field(s): ${missing.join(", ")}\n`);
  process.exit(1);
}
if (/paste your full resume/i.test(profile.resumeText || "")) {
  console.error("\n✖ resumeText still contains the placeholder text. Add your real background first.\n");
  process.exit(1);
}

// Warn (don't block) if targetCategories reference categories that don't exist.
try {
  const categories = JSON.parse(readFileSync("config/categories.json", "utf8"));
  const known = new Set(Object.keys(categories).map((k) => k.toLowerCase()));
  const unknown = (profile.targetCategories || []).filter((c) => !known.has(String(c).toLowerCase()));
  if (unknown.length) {
    console.warn(`⚠  targetCategories not found in categories.json: ${unknown.join(", ")}`);
    console.warn("   (add them to config/categories.json, or these will match nothing)\n");
  }
} catch {
  /* categories.json optional here */
}

const tmp = join(mkdtempSync(join(tmpdir(), "internos-")), "profile.json");
writeFileSync(tmp, JSON.stringify(profile));

console.log(`\nUploading ${FILE} → KV key "profile" (remote)...\n`);
const result = spawnSync(
  "npx",
  // `--preview false` targets the production namespace (the binding has both
  // an id and a preview_id, which wrangler otherwise treats as ambiguous).
  ["wrangler", "kv", "key", "put", "profile", "--binding", "JOBS", "--path", tmp, "--remote", "--preview", "false"],
  { stdio: "inherit", shell: process.platform === "win32" },
);

if (result.status !== 0) {
  console.error(
    "\n✖ Upload failed. Common causes:\n" +
      "  • KV namespace not created yet → `wrangler kv namespace create JOBS`, then paste the id into wrangler.toml\n" +
      "  • Not logged in → `wrangler login`\n",
  );
  process.exit(result.status ?? 1);
}
console.log("\n✅ Profile uploaded. The next scrape run will use it.\n");
