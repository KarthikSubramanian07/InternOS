import schema from "../../config/notion-schema.json";

/** Canonical property names, shared with scripts/setup-notion.mjs via the JSON. */
export const P = schema.properties;
export const DATABASE_TITLE = schema.databaseTitle;
export const STATUS_OPTIONS = schema.statusOptions;
export const SOURCE_OPTIONS = schema.sourceOptions;
export const CATEGORY_COLORS = schema.categoryColors as Record<string, string>;

/** Map a raw source string ("greenhouse" | "github:owner/repo" | ...) to a Source select value. */
export function platformLabel(source: string): string {
  if (source.startsWith("github")) return "GitHub";
  if (source === "greenhouse") return "Greenhouse";
  if (source === "lever") return "Lever";
  if (source === "ashby") return "Ashby";
  return source;
}
