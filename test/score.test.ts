import { describe, it, expect } from "vitest";
import { matchScore, verdictFor } from "../src/filters/score";

const RESUME =
  "CS student. Built a distributed key-value store in Rust. Python, TypeScript, React, Go. " +
  "Machine learning coursework: PyTorch, NLP, transformers. Interned on a backend payments team.";

describe("verdictFor", () => {
  it("maps scores to the rubric bands", () => {
    expect(verdictFor(90)).toBe("Strong");
    expect(verdictFor(65)).toBe("Good");
    expect(verdictFor(50)).toBe("Moderate");
    expect(verdictFor(35)).toBe("Weak");
    expect(verdictFor(10)).toBe("Poor");
  });
});

describe("matchScore", () => {
  it("scores a well-matched intern role higher than an unrelated one", () => {
    const good = matchScore(RESUME, ["SWE", "AI/ML"], {
      role: "Machine Learning Engineer Intern",
      description: "Python, PyTorch, NLP, transformers, backend systems.",
      category: "AI/ML",
    });
    const bad = matchScore(RESUME, ["SWE", "AI/ML"], {
      role: "Warehouse Associate",
      description: "Lift boxes, operate forklift, night shift.",
      category: "Other",
    });
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.score).toBeGreaterThanOrEqual(60);
  });

  it("penalizes senior roles (wrong seniority for an intern)", () => {
    const senior = matchScore(RESUME, ["SWE"], {
      role: "Senior Staff Software Engineer",
      description: "Python, TypeScript, React, distributed systems, 10+ years.",
      category: "SWE",
    });
    expect(senior.score).toBeLessThanOrEqual(35);
  });

  it("boosts when the title clearly names an internship", () => {
    const intern = matchScore(RESUME, ["SWE"], {
      role: "Software Engineer Intern",
      description: "Python, TypeScript, React.",
      category: "SWE",
    });
    expect(intern.verdict === "Strong" || intern.verdict === "Good").toBe(true);
  });

  it("returns Poor when there is nothing to match", () => {
    expect(matchScore("", [], { role: "X", description: "", category: "" }).verdict).toBe("Poor");
  });
});
