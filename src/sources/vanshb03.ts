import type { RawJob } from "../types";
import { fetchRepoSource } from "./parseMarkdownTable";

/**
 * vanshb03/Summer2027-Internships — same generated-table format as SimplifyJobs,
 * one year ahead. Try both `dev` and `main`.
 */
export function fetchVanshb03(): Promise<RawJob[]> {
  return fetchRepoSource({
    source: "github:vanshb03/Summer2027-Internships",
    rawUrls: [
      "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/dev/README.md",
      "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/main/README.md",
    ],
  });
}
