import type { RawJob } from "../types";
import { fetchRepoSource } from "./parseMarkdownTable";

/**
 * northwesternfintech/2027QuantInternships — quant-focused list. Category hint
 * "Quant" catches trading/research roles whose titles don't contain an obvious
 * quant keyword.
 */
export function fetchNuftQuant(): Promise<RawJob[]> {
  return fetchRepoSource({
    source: "github:northwesternfintech/2027QuantInternships",
    rawUrls: [
      "https://raw.githubusercontent.com/northwesternfintech/2027QuantInternships/main/README.md",
    ],
    categoryHint: "Quant",
  });
}
