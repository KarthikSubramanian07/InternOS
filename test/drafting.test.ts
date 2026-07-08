import { describe, it, expect } from "vitest";
import { stripDashes } from "../src/util";
import { sanitize } from "../src/drafting/groq";

describe("stripDashes", () => {
  it("replaces a spaced em-dash with a comma", () => {
    expect(stripDashes("I built X — it cut latency")).toBe("I built X, it cut latency");
  });
  it("replaces an unspaced en-dash (range) with a hyphen", () => {
    expect(stripDashes("3–5 bullets")).toBe("3-5 bullets");
  });
  it("leaves clean text unchanged", () => {
    expect(stripDashes("Plain sentence, no dashes.")).toBe("Plain sentence, no dashes.");
  });
});

describe("sanitize (drafting output guarantee)", () => {
  it("strips em/en dashes from every field", () => {
    const out = sanitize({
      resume_bullets: ["Built X — shipped it", "Led Y – the team"],
      cover_letter: "I am writing — because I care",
      recruiter_email: { subject: "Intern — SWE", body: "Hello — I'd love to chat" },
    });
    const all = [...out.resume_bullets, out.cover_letter, out.recruiter_email.subject, out.recruiter_email.body].join(" ");
    expect(all).not.toMatch(/[—–]/);
    expect(out.resume_bullets[0]).toBe("Built X, shipped it");
  });
});
