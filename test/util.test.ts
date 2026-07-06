import { describe, it, expect } from "vitest";
import {
  resolveLocation,
  relativeAgeToIso,
  parseDateOrAge,
  toIsoDate,
  hashJob,
  looksLikeInternship,
  truncate,
  base64UrlEncode,
  timingSafeEqual,
} from "../src/util";

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("resolveLocation", () => {
  it("labels a pure-remote role as Remote", () => {
    const r = resolveLocation("Remote - US");
    expect(r.display).toBe("Remote");
    expect(r.isRemote).toBe(true);
  });

  it("keeps a physical city and is not remote", () => {
    const r = resolveLocation("San Francisco, CA");
    expect(r.display).toBe("San Francisco, CA");
    expect(r.isRemote).toBe(false);
    expect(r.match).toBe("san francisco, ca");
  });

  it("treats hybrid as in-person, never remote", () => {
    const r = resolveLocation("Hybrid - Seattle");
    expect(r.isRemote).toBe(false);
    expect(r.display).toBe("Hybrid - Seattle");
  });

  it("does not mark hybrid+remote wording as remote", () => {
    const r = resolveLocation("Hybrid, remote 2 days/week, Chicago");
    expect(r.isRemote).toBe(false);
  });

  it("keeps the full string in match even when remote names a city", () => {
    const r = resolveLocation("San Francisco (Remote OK)");
    expect(r.isRemote).toBe(true);
    expect(r.display).toBe("Remote");
    expect(r.match).toContain("san francisco");
  });

  it("handles empty input", () => {
    expect(resolveLocation("")).toEqual({ display: "", match: "", isRemote: false });
  });
});

describe("relativeAgeToIso / parseDateOrAge", () => {
  it("resolves 'today' to today", () => {
    expect(relativeAgeToIso("today")).toBe(daysAgoIso(0));
  });
  it("resolves relative day ages", () => {
    expect(relativeAgeToIso("2d")).toBe(daysAgoIso(2));
    expect(relativeAgeToIso("yesterday")).toBe(daysAgoIso(1));
  });
  it("resolves weeks and months approximately", () => {
    expect(relativeAgeToIso("1w")).toBe(daysAgoIso(7));
    expect(relativeAgeToIso("1mo")).toBe(daysAgoIso(30));
  });
  it("returns null for non-age strings and non-strings", () => {
    expect(relativeAgeToIso("San Francisco")).toBeNull();
    expect(relativeAgeToIso(42 as unknown as string)).toBeNull();
  });
  it("parseDateOrAge prefers an absolute date, else falls back to age", () => {
    expect(parseDateOrAge("2026-06-01")).toBe("2026-06-01");
    expect(parseDateOrAge("3d")).toBe(daysAgoIso(3));
    expect(parseDateOrAge("garbage")).toBeNull();
  });
});

describe("toIsoDate", () => {
  it("parses ISO strings and epoch millis; rejects garbage", () => {
    expect(toIsoDate("2026-01-15T10:00:00Z")).toBe("2026-01-15");
    expect(toIsoDate("not a date")).toBeNull();
    expect(toIsoDate(null)).toBeNull();
  });
});

describe("hashJob", () => {
  it("is a stable 16-hex string keyed on company+role+location (not url)", () => {
    const a = hashJob({ company: "Acme", role: "SWE Intern", location: "San Francisco, CA" } as any);
    const b = hashJob({ company: "Acme", role: "SWE Intern", location: "San Francisco, CA" } as any);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });
  it("differs when the location differs", () => {
    const a = hashJob({ company: "Acme", role: "SWE Intern", location: "NYC" } as any);
    const b = hashJob({ company: "Acme", role: "SWE Intern", location: "Seattle" } as any);
    expect(a).not.toBe(b);
  });
});

describe("looksLikeInternship", () => {
  it("detects intern / co-op titles", () => {
    expect(looksLikeInternship("Software Engineer Intern")).toBe(true);
    expect(looksLikeInternship("Data Science Co-op")).toBe(true);
    expect(looksLikeInternship("Senior Staff Engineer")).toBe(false);
  });
});

describe("truncate", () => {
  it("truncates with an ellipsis and leaves short strings alone", () => {
    expect(truncate("hello", 100)).toBe("hello");
    const long = "x".repeat(50);
    expect(truncate(long, 10).length).toBe(10);
    expect(truncate(long, 10).endsWith("…")).toBe(true);
  });
});

describe("base64UrlEncode", () => {
  it("produces url-safe base64 without padding", () => {
    const out = base64UrlEncode("subject »");
    expect(out).not.toMatch(/[+/=]/);
  });
});

describe("timingSafeEqual", () => {
  it("compares equal and unequal strings", () => {
    expect(timingSafeEqual("secret", "secret")).toBe(true);
    expect(timingSafeEqual("secret", "secreT")).toBe(false);
    expect(timingSafeEqual("secret", "longersecret")).toBe(false);
  });
});
