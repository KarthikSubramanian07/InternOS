import { describe, it, expect } from "vitest";
import { normalizeIncoming } from "../src/ingest";

describe("normalizeIncoming (JobSpy → RawJob)", () => {
  it("maps JobSpy field names (title/job_url/site/date_posted)", () => {
    const r = normalizeIncoming({
      company: "Acme",
      title: "Software Engineer Intern",
      job_url: "https://acme.com/1",
      location: "San Francisco, CA",
      date_posted: "2026-06-20",
      description: "Build things",
      salary: "$45/hr",
      site: "indeed",
    });
    expect(r).not.toBeNull();
    expect(r!.role).toBe("Software Engineer Intern");
    expect(r!.url).toBe("https://acme.com/1");
    expect(r!.datePosted).toBe("2026-06-20");
    expect(r!.salary).toBe("$45/hr");
    expect(r!.source).toBe("jobspy:indeed");
  });

  it("accepts our own field names too and keeps a jobspy: source prefix", () => {
    const r = normalizeIncoming({ company: "Beta", role: "ML Intern", url: "https://b/2", source: "jobspy:linkedin" });
    expect(r!.source).toBe("jobspy:linkedin");
    expect(r!.role).toBe("ML Intern");
  });

  it("drops rows missing company, role, or url", () => {
    expect(normalizeIncoming({ role: "X", url: "https://x" })).toBeNull();
    expect(normalizeIncoming({ company: "X", url: "https://x" })).toBeNull();
    expect(normalizeIncoming({ company: "X", role: "Y" })).toBeNull();
  });

  it("defaults source to jobspy and coerces a bad date to null", () => {
    const r = normalizeIncoming({ company: "C", role: "R", url: "https://c/3", datePosted: "not-a-date" });
    expect(r!.source).toBe("jobspy");
    expect(r!.datePosted).toBeNull();
  });
});
