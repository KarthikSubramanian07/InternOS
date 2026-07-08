import { describe, it, expect } from "vitest";
import { categorize, categorizeAndFilter, type FilterOptions } from "../src/filters/categorize";
import type { CategoryConfig, LocationConfig, RawJob } from "../src/types";

const CATEGORIES: CategoryConfig = {
  SWE: ["software engineer", "swe"],
  "AI/ML": ["machine learning", "ml engineer"],
  Quant: ["quant"],
};

const LOCATIONS: LocationConfig = {
  Remote: ["remote", "anywhere"],
  "Bay Area": ["bay area", "san francisco", "san jose"],
  Seattle: ["seattle", "bellevue"],
};

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function raw(overrides: Partial<RawJob> = {}): RawJob {
  return {
    company: "Acme",
    role: "Software Engineer Intern",
    location: "San Francisco, CA",
    url: "https://acme.com/job/1",
    datePosted: daysAgoIso(2),
    source: "greenhouse",
    ...overrides,
  };
}

function opts(overrides: Partial<FilterOptions> = {}): FilterOptions {
  return {
    internshipsOnly: false,
    targetCategories: [],
    locations: [],
    locationConfig: LOCATIONS,
    maxAgeDays: 0,
    simplifyMinDate: "",
    resumeText: "python typescript react distributed systems machine learning",
    ...overrides,
  };
}

describe("categorize", () => {
  it("matches the title first", () => {
    expect(categorize(raw({ role: "Software Engineer Intern" }), CATEGORIES)).toBe("SWE");
  });
  it("falls back to the source category hint", () => {
    expect(categorize(raw({ role: "Research Intern", categoryHint: "AI/ML" }), CATEGORIES)).toBe("AI/ML");
  });
  it("defaults to Other", () => {
    expect(categorize(raw({ role: "Barista" }), CATEGORIES)).toBe("Other");
  });
});

describe("categorizeAndFilter — internship filter", () => {
  it("drops non-intern board roles but keeps curated GitHub roles", () => {
    const jobs = categorizeAndFilter(
      [
        raw({ role: "Software Engineer", source: "greenhouse", url: "u1" }),
        raw({ role: "Software Engineer Intern", source: "greenhouse", url: "u2" }),
        raw({ role: "Software Engineer", source: "github:speedyapply/x", url: "u3" }),
      ],
      CATEGORIES,
      opts({ internshipsOnly: true }),
    );
    const roles = jobs.map((j) => `${j.source}:${j.role}`);
    expect(roles).toContain("greenhouse:Software Engineer Intern");
    expect(roles).toContain("github:speedyapply/x:Software Engineer");
    expect(roles).not.toContain("greenhouse:Software Engineer");
  });
});

describe("categorizeAndFilter — category filter", () => {
  it("keeps only target categories", () => {
    const jobs = categorizeAndFilter(
      [
        raw({ role: "Software Engineer Intern", url: "u1" }),
        raw({ role: "ML Engineer Intern", url: "u2" }),
      ],
      CATEGORIES,
      opts({ targetCategories: ["SWE"] }),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].category).toBe("SWE");
  });
});

describe("categorizeAndFilter — location filter", () => {
  it("matches a metro by its cities and drops others", () => {
    const jobs = categorizeAndFilter(
      [
        raw({ location: "San Francisco, CA", url: "u1" }),
        raw({ location: "Seattle, WA", url: "u2" }),
      ],
      CATEGORIES,
      opts({ locations: ["Bay Area"] }),
    );
    expect(jobs.map((j) => j.location)).toEqual(["San Francisco, CA"]);
  });

  it("matches remote roles only for a Remote target and relabels them", () => {
    const jobs = categorizeAndFilter(
      [
        raw({ location: "Remote - US", url: "u1" }),
        raw({ location: "San Jose, CA", url: "u2" }),
      ],
      CATEGORIES,
      opts({ locations: ["Remote"] }),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].location).toBe("Remote");
  });

  it("does NOT match a hybrid role that mentions remote for a Remote-only seeker", () => {
    const jobs = categorizeAndFilter(
      [raw({ location: "Hybrid, remote 2 days, Chicago", url: "u1" })],
      CATEGORIES,
      opts({ locations: ["Remote"] }),
    );
    expect(jobs).toHaveLength(0);
  });

  it("still matches a remote-in-a-city role for a city seeker", () => {
    const jobs = categorizeAndFilter(
      [raw({ location: "San Francisco (Remote OK)", url: "u1" })],
      CATEGORIES,
      opts({ locations: ["Bay Area"] }),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].location).toBe("Remote"); // display relabeled, but matched via city
  });

  it("ignores unknown regions instead of over-matching (naked 'CA' must not match 'Chicago')", () => {
    const jobs = categorizeAndFilter(
      [
        raw({ location: "Chicago, IL", url: "u1" }), // "chicago" contains "ca" — must NOT match
        raw({ location: "Seattle, WA", url: "u2" }),
      ],
      CATEGORIES,
      opts({ locations: ["Seattle", "CA"] }), // Seattle is a real region; CA is unknown → no subs
    );
    expect(jobs.map((j) => j.location)).toEqual(["Seattle, WA"]);
  });
});

describe("categorizeAndFilter — recency window", () => {
  it("keeps recent, drops old and undated", () => {
    const jobs = categorizeAndFilter(
      [
        raw({ datePosted: daysAgoIso(2), url: "u1" }),
        raw({ datePosted: daysAgoIso(40), url: "u2" }),
        raw({ datePosted: null, url: "u3" }),
      ],
      CATEGORIES,
      opts({ maxAgeDays: 31 }),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].url).toBe("u1");
  });
});

describe("categorizeAndFilter — Simplify cutoff", () => {
  it("drops Simplify rows before the cutoff but keeps other sources", () => {
    const jobs = categorizeAndFilter(
      [
        raw({ source: "github:SimplifyJobs/Summer2026-Internships", datePosted: daysAgoIso(10), url: "u1" }),
        raw({ source: "greenhouse", datePosted: daysAgoIso(10), url: "u2" }),
      ],
      CATEGORIES,
      opts({ simplifyMinDate: daysAgoIso(1) }),
    );
    expect(jobs.map((j) => j.url)).toEqual(["u2"]);
  });
});

describe("categorizeAndFilter — output shape", () => {
  it("assigns category and strips the categoryHint", () => {
    const [job] = categorizeAndFilter(
      [raw({ role: "Research Intern", categoryHint: "AI/ML", url: "u1" })],
      CATEGORIES,
      opts(),
    );
    expect(job.category).toBe("AI/ML");
    expect((job as any).categoryHint).toBeUndefined();
  });
});
