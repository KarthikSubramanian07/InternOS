import { describe, it, expect } from "vitest";
import { parseSalary, formatRange } from "../src/scraper/salary";
import { jobFlags } from "../src/filters/flags";
import { buildCandidate, scoreWithCandidate } from "../src/filters/score";

describe("parseSalary", () => {
  it("pulls hourly and annual ranges out of text", () => {
    expect(parseSalary("Pay is $45/hr for this role")).toBe("$45/hr");
    expect(parseSalary("Compensation: $120,000 - $150,000 per year")).toContain("$120,000");
    expect(parseSalary("no pay listed here")).toBe("");
  });
});

describe("formatRange", () => {
  it("formats a structured Lever-style range", () => {
    expect(formatRange({ min: 90000, max: 120000, currency: "USD", interval: "year" })).toBe(
      "$90,000 - $120,000/year",
    );
    expect(formatRange(undefined)).toBe("");
  });
});

describe("jobFlags", () => {
  it("flags evergreen/pipeline postings", () => {
    expect(jobFlags({ role: "Join our Talent Community", description: "" })).toContain("Evergreen");
    expect(jobFlags({ role: "SWE Intern", description: "General application for future opportunities" })).toContain(
      "Evergreen",
    );
  });
  it("flags sparse descriptions but not full ones", () => {
    expect(jobFlags({ role: "SWE Intern", description: "Short." })).toContain("Sparse");
    expect(jobFlags({ role: "SWE Intern", description: "x".repeat(500) })).toBe("");
  });
});

describe("scoreWithCandidate boost", () => {
  it("boosts a job whose category has converted before", () => {
    const cand = buildCandidate("python react backend", ["SWE"]);
    const job = { role: "Software Engineer Intern", description: "python react", category: "SWE" };
    const base = scoreWithCandidate(cand, job).score;
    const boosted = scoreWithCandidate(cand, job, new Set(["swe"])).score;
    expect(boosted).toBeGreaterThanOrEqual(base);
  });
});
