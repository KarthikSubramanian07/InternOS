import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Shared Notion schema builders for the setup + configure scripts, so the column
 * set / order / colors live in ONE place (adding a column touches only this file
 * plus config/notion-schema.json).
 */
const here = dirname(fileURLToPath(import.meta.url));
export const schema = JSON.parse(readFileSync(join(here, "../config/notion-schema.json"), "utf8"));
export const categories = JSON.parse(readFileSync(join(here, "../config/categories.json"), "utf8"));
export const P = schema.properties;

const FALLBACK_COLORS = ["blue", "purple", "green", "orange", "pink", "brown", "red", "yellow"];

/** Category select options from categories.json keys (+ "Other"), colored per schema. */
export function categoryOptions() {
  const names = [...Object.keys(categories), "Other"];
  return names.map((name, i) => ({
    name,
    color: schema.categoryColors[name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }));
}

/** Non-title columns, in human-intuitive display order: [propertyName, definition]. */
export function orderedColumns() {
  return [
    [P.role, { rich_text: {} }],
    [P.category, { select: { options: categoryOptions() } }],
    [P.fit, { select: { options: schema.fitOptions } }],
    [P.matchScore, { number: { format: "number" } }],
    [P.location, { rich_text: {} }],
    [P.datePosted, { date: {} }],
    [P.status, { select: { options: schema.statusOptions } }],
    [P.apply, { checkbox: {} }],
    [P.dismiss, { checkbox: {} }],
    [P.link, { url: {} }],
    [P.resumeDraft, { rich_text: {} }],
    [P.coverLetterDraft, { rich_text: {} }],
    [P.recruiterEmailDraft, { rich_text: {} }],
    [P.gmailDraftLink, { url: {} }],
    [P.source, { select: { options: schema.sourceOptions } }],
    [P.description, { rich_text: {} }],
  ];
}

export const ICON = { type: "emoji", emoji: "🎯" };

export const DESCRIPTION = [
  {
    type: "text",
    text: {
      content:
        "Auto-updated internship tracker. Tick Apply ✅ to generate tailored drafts; tick Dismiss ❌ to remove a listing. Tip: group by Status for a Kanban and hide 'Job Description'.",
    },
  },
];

export function notionHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}
