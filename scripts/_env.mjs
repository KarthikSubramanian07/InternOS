import { readFileSync, existsSync } from "node:fs";

/**
 * Resolve config values for the local setup scripts. Priority:
 *   1. process.env
 *   2. .dev.vars   (wrangler's local vars file)
 *   3. .env
 * These files are gitignored — nothing here is committed.
 */
export function loadEnv() {
  const merged = {};
  for (const file of [".env", ".dev.vars"]) {
    if (existsSync(file)) Object.assign(merged, parseEnvFile(readFileSync(file, "utf8")));
  }
  Object.assign(merged, process.env); // process.env wins
  return merged;
}

function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function must(env, key, hint) {
  const v = env[key];
  if (!v || v.startsWith("secret_xxx") || v.includes("xxx")) {
    console.error(`\n✖ Missing ${key}. ${hint ?? ""}`);
    console.error(`  Set it in .env / .dev.vars or export it before running.\n`);
    process.exit(1);
  }
  return v;
}
