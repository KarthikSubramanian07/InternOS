import type { DraftResult, Env, Profile } from "../types";
import type { PageJob } from "../notion/client";
import { fetchWithTimeout, truncate } from "../util";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const OUTPUT_SHAPE = `{
  "resume_bullets": ["string", "..."],
  "cover_letter": "string",
  "recruiter_email": { "subject": "string", "body": "string" }
}`;

/**
 * Generate tailored application drafts with Groq. Uses JSON mode + an explicit
 * schema so parsing is reliable; retries once if the model returns non-JSON.
 * The LLM is used ONLY here — never in the scrape/filter path.
 */
export async function draftApplication(
  env: Env,
  job: PageJob,
  profile: Profile,
): Promise<DraftResult> {
  if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");

  const messages = buildMessages(job, profile);

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callGroq(env, messages);
      return validate(JSON.parse(raw));
    } catch (err) {
      lastErr = err;
      // Nudge the model toward strict JSON on the retry.
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

function buildMessages(job: PageJob, profile: Profile): ChatMessage[] {
  const tone = profile.tone || "concise, confident, specific, no clichés or filler";
  const links = profile.links
    ? Object.entries(profile.links)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : "";

  const system = [
    "You are an expert career-writing assistant helping a university student apply to internships.",
    `Write in the applicant's authentic voice. Style: ${tone}.`,
    "Ground every claim in the APPLICANT BACKGROUND provided — never invent experience, employers, metrics, or skills the background does not support. If the background is thin, stay general rather than fabricating.",
    `Output ONLY a single valid JSON object of exactly this shape (no markdown, no commentary):\n${OUTPUT_SHAPE}`,
  ].join(" ");

  const applicant = [
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

  const target = [
    `Company: ${job.company}`,
    `Role: ${job.role}`,
    job.location ? `Location: ${job.location}` : "",
    job.category ? `Category: ${job.category}` : "",
    job.url ? `Link: ${job.url}` : "",
    job.description ? `\nJOB DESCRIPTION:\n${truncate(job.description, 4000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const instructions = [
    "Produce three tailored artifacts for THIS specific role:",
    "1. resume_bullets: 3–5 bullets, each starting with a strong action verb, quantified where the background supports it, chosen to match this role. No leading '•' — just the text.",
    "2. cover_letter: under 200 words, addressed to 'Dear Hiring Team', specific to the company and role, opening with a genuine hook.",
    "3. recruiter_email: a cold outreach email. subject ≤ 8 words; body ≤ 150 words, warm and specific, one clear ask (a short chat / consideration), signed with the applicant's name. Do NOT include a 'To:' line — the applicant fills the recipient in.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: `${applicant}\n\n--- TARGET ROLE ---\n${target}\n\n--- TASK ---\n${instructions}` },
  ];
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
