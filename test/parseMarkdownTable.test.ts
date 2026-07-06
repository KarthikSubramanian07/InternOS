import { describe, it, expect } from "vitest";
import { parseJobsFromMarkdown } from "../src/sources/parseMarkdownTable";

describe("parseJobsFromMarkdown — HTML tables (Simplify/vanshb03 style)", () => {
  const html = `
<table>
<tr><th>Company</th><th>Role</th><th>Location</th><th>Application/Link</th><th>Age</th></tr>
<tr>
<td><strong><a href="https://simplify.jobs/c/PaloAlto?utm_source=GHList">Palo Alto Networks</a></strong></td>
<td>Software Engineer Intern</td>
<td>Palo Alto, CA</td>
<td><div align="center"><a href="https://paloaltonetworks.wd5.myworkdayjobs.com/job/123?utm_source=Simplify&ref=Simplify"><img src="apply.png" alt="Apply"></a></div></td>
<td>4d</td>
</tr>
<tr>
<td>↳</td>
<td>Backend Engineer Intern</td>
<td>California</td>
<td><div align="center"><a href="https://paloaltonetworks.wd5.myworkdayjobs.com/job/456"><img src="apply.png" alt="Apply"></a></div></td>
<td>4d</td>
</tr>
</table>`;

  const jobs = parseJobsFromMarkdown(html, { source: "github:SimplifyJobs/Summer2026-Internships" });

  it("parses both rows", () => {
    expect(jobs).toHaveLength(2);
  });
  it("inherits the company on a ↳ continuation row", () => {
    expect(jobs[0].company).toBe("Palo Alto Networks");
    expect(jobs[1].company).toBe("Palo Alto Networks");
  });
  it("extracts the employer apply URL (first href) and strips tracking params", () => {
    expect(jobs[0].url).toContain("paloaltonetworks.wd5.myworkdayjobs.com/job/123");
    expect(jobs[0].url).not.toContain("utm_source");
    expect(jobs[0].url).not.toContain("ref=Simplify");
  });
});

describe("parseJobsFromMarkdown — pipe tables (speedyapply style)", () => {
  const md = `
| Company | Position | Location | Salary | Posting | Age |
|---|---|---|---|---|---|
| <a href="https://tiktok.com"><strong>TikTok</strong></a> | Frontend Engineer Intern | San Jose | $60/hr | <a href="https://lifeattiktok.com/apply/7"><img src="a.png" alt="Apply"></a> | 12d |
`;
  const jobs = parseJobsFromMarkdown(md, { source: "github:speedyapply/2026-SWE-College-Jobs", categoryHint: "SWE" });

  it("parses the row with company, location, and the apply (Posting) URL", () => {
    expect(jobs).toHaveLength(1);
    expect(jobs[0].company).toBe("TikTok");
    expect(jobs[0].role).toBe("Frontend Engineer Intern");
    expect(jobs[0].location).toBe("San Jose");
    expect(jobs[0].url).toContain("lifeattiktok.com/apply/7");
    expect(jobs[0].categoryHint).toBe("SWE");
  });
});

describe("parseJobsFromMarkdown — heading + Role|Links (northwesternfintech style)", () => {
  const md = `
## Akuna Capital
**Website**: [Akuna Capital](https://akunacapital.com)

**Locations**: Chicago

**Notes**: Options market maker.

|Role|Links|
|-------|-------|
|Quant Trader Intern|[Apply](https://akuna.com/apply/1)|
`;
  const jobs = parseJobsFromMarkdown(md, { source: "github:northwesternfintech/2027QuantInternships", categoryHint: "Quant" });

  it("takes the company from the ## heading and the location from **Locations**", () => {
    expect(jobs).toHaveLength(1);
    expect(jobs[0].company).toBe("Akuna Capital");
    expect(jobs[0].location).toBe("Chicago");
    expect(jobs[0].role).toBe("Quant Trader Intern");
    expect(jobs[0].url).toBe("https://akuna.com/apply/1");
  });
});

describe("parseJobsFromMarkdown — skips closed/locked rows", () => {
  const md = `
| Company | Role | Location | Link | Date |
|---|---|---|---|---|
| Acme | SWE Intern | NYC | https://acme.com/1 | 2026-06-01 |
| Beta 🔒 | SWE Intern | NYC | https://beta.com/1 | 2026-06-01 |
`;
  it("drops the 🔒 row", () => {
    const jobs = parseJobsFromMarkdown(md, { source: "github:test/x" });
    expect(jobs.map((j) => j.company)).toEqual(["Acme"]);
  });
});
