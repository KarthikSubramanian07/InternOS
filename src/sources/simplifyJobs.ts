import type { RawJob } from "../types";
import { fetchRepoSource } from "./parseMarkdownTable";

/**
 * SimplifyJobs/Summer2026-Internships — the largest community internship list.
 * The generated README table lives on the `dev` branch; we also try `main` as a
 * fallback (duplicates collapse in the dedupe step, so trying both is safe).
 */
export function fetchSimplifyJobs(): Promise<RawJob[]> {
  return fetchRepoSource({
    source: "github:SimplifyJobs/Summer2026-Internships",
    rawUrls: [
      "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/README.md",
      "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/main/README.md",
    ],
  });
}
