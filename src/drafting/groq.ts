import type { DraftResult, Env, Profile } from "../types";
import type { PageJob } from "../notion/client";
import { fetchWithTimeout, stripDashes, truncate } from "../util";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const OUTPUT_SHAPE = `{
  "resume_bullets": ["string", "..."],
  "cover_letter": "string",
  "recruiter_email": { "subject": "string", "body": "string" }
}`;

// Phrases that read as generic AI filler. The model is told to avoid them, and we
// do not hard-strip them (that would mangle sentences) but they anchor the rule.
const BANNED_PHRASES = [
  "passionate about",
  "leverage",
  "hit the ground running",
  "drive results",
  "synergies",
  "i believe i would be a great fit",
  "team player",
  "detail-oriented",
  "results-driven",
  "think outside the box",
  "wear many hats",
  "fast-paced environment",
  "proven track record",
];

const STYLE_RULES = [
  "Write plainly and directly in the applicant's own first-person, active voice (\"I built\", not \"a system was built\"). Demonstrate with specifics; do not assert generic qualities.",
  "NEVER use em-dashes or en-dashes. Use commas, periods, or restructure the sentence.",
  `NEVER use cliches or filler. Banned phrases include: ${BANNED_PHRASES.join(", ")}. Do not use generic buzzwords without a concrete fact behind them.`,
  "No apologetic or overly humble language. Not \"I think I could help\" but \"I built X, which did Y\".",
  "NO FABRICATION: ground every claim in the APPLICANT BACKGROUND. Never invent experience, employers, metrics, or skills. If a requirement is a gap, do not claim it; honestly frame the closest real experience. Apply the interview-backtrack test: the applicant must be able to defend every line in an interview without saying \"what I actually meant was...\".",
].join(" ");

/**
 * Generate tailored application drafts with Groq, then refine them with a second
 * "reviewer" pass (a hiring-manager proxy) before returning. Uses JSON mode + an
 * explicit schema so parsing is reliable. The LLM is used ONLY here, never in the
 * scrape/filter path.
 */
export async function draftApplication(
  env: Env,
  job: PageJob,
  profile: Profile,
): Promise<DraftResult> {
  if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");

  const draft = await runDrafter(env, job, profile);

  // Reviewer pass: refine for keyword coverage, specificity, and style. Best-effort
  // — if it fails or returns junk, keep the drafter output.
  let result = draft;
  try {
    result = await runReviewer(env, job, profile, draft);
  } catch (err) {
    console.warn("reviewer pass skipped:", (err as Error).message);
  }

  return sanitize(result);
}

async function runDrafter(env: Env, job: PageJob, profile: Profile): Promise<DraftResult> {
  const messages = buildDrafterMessages(job, profile);
  return draftLoop(env, messages);
}

async function runReviewer(
  env: Env,
  job: PageJob,
  profile: Profile,
  draft: DraftResult,
): Promise<DraftResult> {
  const messages = buildReviewerMessages(job, profile, draft);
  return draftLoop(env, messages);
}

/** Call Groq up to twice, retrying once if the reply is not parseable JSON. */
async function draftLoop(env: Env, messages: ChatMessage[]): Promise<DraftResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callGroq(env, messages);
      return validate(JSON.parse(raw));
    } catch (err) {
      lastErr = err;
      messages.push({
        role: "user",
        content: `Your previous reply was not valid JSON I could parse. Reply again with ONLY a JSON object of exactly this shape, nothing else:\n${OUTPUT_SHAPE}`,
      });
    }
  }
  throw new Error(`Groq drafting failed: ${(lastErr as Error)?.message ?? lastErr}`);
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callGroq(env: Env, messages: ChatMessage[]): Promise<string> {
  const res = await fetchWithTimeout(
    GROQ_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL || "llama-3.3-70b-versatile",
        temperature: 0.4,
        max_tokens: 1800,
        response_format: { type: "json_object" },
        messages,
      }),
    },
    30000,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned empty content");
  return content;
}

function buildDrafterMessages(job: PageJob, profile: Profile): ChatMessage[] {
  const system = [
    "You are an expert career-writing assistant helping a university student apply to internships.",
    STYLE_RULES,
    `Output ONLY a single valid JSON object of exactly this shape (no markdown, no commentary):\n${OUTPUT_SHAPE}`,
  ].join(" ");

  const instructions = [
    "Produce three tailored artifacts for THIS specific role:",
    "1. resume_bullets: 3 to 5 bullets, each starting with a strong action verb, quantified where the background supports it, chosen to match this role. Just the text, no leading bullet character.",
    "2. cover_letter: 150 to 220 words, addressed to \"Dear Hiring Team\", specific to the company and role, forward-looking (what you can do for them, not only what you have done), opening with a concrete hook.",
    "3. recruiter_email: a short cold outreach email. subject at most 8 words. body at most 150 words, warm and direct, with one clear ask (a brief chat or consideration), signed with the applicant's name. Do NOT include a \"To:\" line; the applicant fills the recipient in.",
  ].join("\n");

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `${applicantBlock(profile)}\n\n--- TARGET ROLE ---\n${roleBlock(job)}\n\n--- TASK ---\n${instructions}`,
    },
  ];
}

function buildReviewerMessages(job: PageJob, profile: Profile, draft: DraftResult): ChatMessage[] {
  const system = [
    "You are a hiring-manager proxy reviewing a first draft of an internship application.",
    "Make it as targeted and compelling as possible while keeping it truthful.",
    STYLE_RULES,
    "Improve keyword coverage against the job description using ONLY skills the applicant genuinely has. Cut anything vague, passive, or cliched. Tighten to the length limits.",
    `Return the improved application as ONLY a single valid JSON object of exactly this shape:\n${OUTPUT_SHAPE}`,
  ].join(" ");

  const current = JSON.stringify(
    {
      resume_bullets: draft.resume_bullets,
      cover_letter: draft.cover_letter,
      recruiter_email: draft.recruiter_email,
    },
    null,
    2,
  );

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `${applicantBlock(profile)}\n\n--- TARGET ROLE ---\n${roleBlock(job)}\n\n--- FIRST DRAFT (improve it) ---\n${current}`,
    },
  ];
}

function applicantBlock(profile: Profile): string {
  const links = profile.links
    ? Object.entries(profile.links)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : "";
  return [
    `Name: ${profile.name}`,
    profile.school ? `School: ${profile.school}` : "",
    profile.gradYear ? `Graduation: ${profile.gradYear}` : "",
    profile.email ? `Email: ${profile.email}` : "",
    profile.phone ? `Phone: ${profile.phone}` : "",
    links ? `Links: ${links}` : "",
    "",
    "APPLICANT BACKGROUND:",
    truncate(profile.resumeText, 6000),
  ]
    .filter(Boolean)
    .join("\n");
}

function roleBlock(job: PageJob): string {
  return [
    `Company: ${job.company}`,
    `Role: ${job.role}`,
    job.location ? `Location: ${job.location}` : "",
    job.category ? `Category: ${job.category}` : "",
    job.url ? `Link: ${job.url}` : "",
    job.description ? `\nJOB DESCRIPTION:\n${truncate(job.description, 4000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function validate(parsed: any): DraftResult {
  const bullets = Array.isArray(parsed?.resume_bullets)
    ? parsed.resume_bullets.map((b: unknown) => String(b)).filter(Boolean)
    : [];
  const coverLetter = typeof parsed?.cover_letter === "string" ? parsed.cover_letter : "";
  const email = parsed?.recruiter_email ?? {};
  const subject = typeof email.subject === "string" ? email.subject : "";
  const body = typeof email.body === "string" ? email.body : "";

  if (!bullets.length && !coverLetter && !body) {
    throw new Error("Groq output missing all fields");
  }
  return {
    resume_bullets: bullets,
    cover_letter: coverLetter,
    recruiter_email: { subject, body },
  };
}

/** Final guarantee: no em/en dashes anywhere in the returned drafts. */
export function sanitize(r: DraftResult): DraftResult {
  return {
    resume_bullets: r.resume_bullets.map(stripDashes),
    cover_letter: stripDashes(r.cover_letter),
    recruiter_email: {
      subject: stripDashes(r.recruiter_email.subject),
      body: stripDashes(r.recruiter_email.body),
    },
  };
}
