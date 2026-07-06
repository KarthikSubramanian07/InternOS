import { describe, it, expect } from "vitest";
import { headerSafe } from "../src/gmail/drafts";

describe("headerSafe (MIME header-injection guard)", () => {
  it("strips CR/LF so a subject can't inject extra headers", () => {
    const evil = "Hello\r\nBcc: attacker@evil.com";
    const safe = headerSafe(evil);
    expect(safe).not.toContain("\r");
    expect(safe).not.toContain("\n");
    expect(safe).toBe("Hello Bcc: attacker@evil.com");
  });
  it("leaves clean subjects unchanged", () => {
    expect(headerSafe("Internship interest — SWE")).toBe("Internship interest — SWE");
  });
});
