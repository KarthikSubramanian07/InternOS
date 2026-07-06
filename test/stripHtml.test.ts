import { describe, it, expect } from "vitest";
import { stripHtml } from "../src/scraper/html";

describe("stripHtml", () => {
  it("decodes entity-encoded HTML (Greenhouse) so tags don't leak as text", () => {
    const input = "&lt;h2&gt;Who we are&lt;/h2&gt;&lt;p&gt;We build things.&lt;/p&gt;";
    const out = stripHtml(input);
    expect(out).not.toContain("<");
    expect(out).not.toContain("&lt;");
    expect(out).toContain("Who we are");
    expect(out).toContain("We build things.");
  });

  it("strips real HTML tags", () => {
    const out = stripHtml('<div class="x"><p>Alpha</p><p>Beta</p></div>');
    expect(out).not.toMatch(/<[a-z/]/i);
    expect(out).toContain("Alpha");
    expect(out).toContain("Beta");
  });

  it("turns <br> into newlines and decodes named entities", () => {
    const out = stripHtml("Line1<br>Line2 &amp; more");
    expect(out).toContain("Line1");
    expect(out).toContain("Line2 & more");
  });

  it("truncates to the max length", () => {
    const out = stripHtml("x".repeat(9000), 100);
    expect(out.length).toBe(101); // 100 chars + ellipsis
    expect(out.endsWith("…")).toBe(true);
  });

  it("handles empty/nullish input", () => {
    expect(stripHtml("")).toBe("");
    expect(stripHtml(undefined)).toBe("");
    expect(stripHtml(null)).toBe("");
  });
});
