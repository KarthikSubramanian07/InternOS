import { describe, it, expect } from "vitest";
import {
  val,
  jobToCreateProperties,
  draftsToUpdateProperties,
  readJobFromPage,
} from "../src/notion/client";
import { P, platformLabel } from "../src/notion/schema";
import type { DraftResult, Job } from "../src/types";

const job: Job = {
  company: "Acme",
  role: "Software Engineer Intern",
  location: "Remote",
  category: "SWE",
  url: "https://acme.com/job/1",
  datePosted: "2026-06-20",
  description: "&lt;p&gt;Build cool things&lt;/p&gt;", // entity-encoded HTML
  source: "greenhouse",
};

describe("platformLabel", () => {
  it("maps sources to Source select values", () => {
    expect(platformLabel("greenhouse")).toBe("Greenhouse");
    expect(platformLabel("lever")).toBe("Lever");
    expect(platformLabel("ashby")).toBe("Ashby");
    expect(platformLabel("github:SimplifyJobs/x")).toBe("GitHub");
  });
});

describe("val builders", () => {
  it("chunks long rich_text into <=2000-char items", () => {
    const out = val.richText("y".repeat(5000)) as { rich_text: Array<{ text: { content: string } }> };
    expect(out.rich_text.length).toBeGreaterThan(1);
    for (const item of out.rich_text) expect(item.text.content.length).toBeLessThanOrEqual(2000);
  });
  it("emits null select/url/date for empty values", () => {
    expect((val.select(null) as any).select).toBeNull();
    expect((val.url("") as any).url).toBeNull();
    expect((val.date(null) as any).date).toBeNull();
  });
});

describe("jobToCreateProperties", () => {
  const props = jobToCreateProperties(job) as Record<string, any>;
  it("sets the title, category, source, and date", () => {
    expect(props[P.company].title[0].text.content).toBe("Acme");
    expect(props[P.category].select.name).toBe("SWE");
    expect(props[P.source].select.name).toBe("Greenhouse");
    expect(props[P.datePosted].date.start).toBe("2026-06-20");
  });
  it("defaults Status/Apply/Dismiss", () => {
    expect(props[P.status].select.name).toBe("Not Applied");
    expect(props[P.apply].checkbox).toBe(false);
    expect(props[P.dismiss].checkbox).toBe(false);
  });
  it("stores the description as clean plain text (HTML stripped)", () => {
    const desc = props[P.description].rich_text.map((t: any) => t.text.content).join("");
    expect(desc).toContain("Build cool things");
    expect(desc).not.toContain("<");
    expect(desc).not.toContain("&lt;");
  });
});

describe("draftsToUpdateProperties", () => {
  const drafts: DraftResult = {
    resume_bullets: ["Did X", "Did Y"],
    cover_letter: "Dear Hiring Team, ...",
    recruiter_email: { subject: "Intern interest", body: "Hi there," },
  };
  it("formats bullets, cover letter, and email; includes the gmail link when present", () => {
    const props = draftsToUpdateProperties({ drafts, gmailDraftLink: "https://mail.google.com/#drafts" }) as Record<string, any>;
    const bullets = props[P.resumeDraft].rich_text.map((t: any) => t.text.content).join("");
    expect(bullets).toContain("• Did X");
    const email = props[P.recruiterEmailDraft].rich_text.map((t: any) => t.text.content).join("");
    expect(email).toContain("Subject: Intern interest");
    expect(props[P.gmailDraftLink].url).toContain("mail.google.com");
  });
  it("omits the gmail link when absent", () => {
    const props = draftsToUpdateProperties({ drafts }) as Record<string, any>;
    expect(props[P.gmailDraftLink]).toBeUndefined();
  });
});

describe("readJobFromPage", () => {
  it("extracts fields and the Apply checkbox from a Notion page", () => {
    const page = {
      properties: {
        [P.company]: { title: [{ plain_text: "Acme" }] },
        [P.role]: { rich_text: [{ plain_text: "SWE Intern" }] },
        [P.location]: { rich_text: [{ plain_text: "Remote" }] },
        [P.link]: { url: "https://acme.com/1" },
        [P.category]: { select: { name: "SWE" } },
        [P.description]: { rich_text: [{ plain_text: "JD text" }] },
        [P.apply]: { checkbox: true },
      },
    };
    const j = readJobFromPage(page);
    expect(j.company).toBe("Acme");
    expect(j.role).toBe("SWE Intern");
    expect(j.url).toBe("https://acme.com/1");
    expect(j.category).toBe("SWE");
    expect(j.applyChecked).toBe(true);
  });
});
