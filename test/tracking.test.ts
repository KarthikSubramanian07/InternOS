import { describe, expect, it } from "vitest";
import { isSafeRedirectTarget } from "../src/tracking";

describe("isSafeRedirectTarget", () => {
  it("allows http and https", () => {
    expect(isSafeRedirectTarget("https://example.com/apply")).toBe(true);
    expect(isSafeRedirectTarget("http://example.com")).toBe(true);
  });

  it("rejects dangerous schemes", () => {
    expect(isSafeRedirectTarget("javascript:alert(1)")).toBe(false);
    expect(isSafeRedirectTarget("data:text/html,hi")).toBe(false);
    expect(isSafeRedirectTarget("file:///etc/passwd")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isSafeRedirectTarget("not a url")).toBe(false);
    expect(isSafeRedirectTarget("")).toBe(false);
  });
});
