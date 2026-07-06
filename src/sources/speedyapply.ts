import type { RawJob } from "../types";
import { fetchRepoSource } from "./parseMarkdownTable";

/**
 * speedyapply maintains two topic-specific lists. Each gets a category hint so
 * roles with generic titles ("Intern", "Research Intern") still land in the
 * right bucket when keyword matching is inconclusive.
 */
export async function fetchSpeedyApply(): Promise<RawJob[]> {
  const [swe, ai] = await Promise.all([
    fetchRepoSource({
      source: "github:speedyapply/2026-SWE-College-Jobs",
      rawUrls: [
        "https://raw.githubusercontent.com/speedyapply/2026-SWE-College-Jobs/main/README.md",
      ],
      categoryHint: "SWE",
    }),
    fetchRepoSource({
      source: "github:speedyapply/2026-AI-College-Jobs",
      rawUrls: [
        "https://raw.githubusercontent.com/speedyapply/2026-AI-College-Jobs/main/README.md",
      ],
      categoryHint: "AI/ML",
    }),
  ]);
  return [...swe, ...ai];
}
