import type { Env } from "../types";
import { base64UrlEncode, fetchWithTimeout } from "../util";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRAFTS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";

/**
 * Create a Gmail *draft* (never sends — we only ever request the compose scope).
 * Returns a link to the drafts folder. Throws if Gmail isn't configured, which
 * the caller treats as non-fatal (drafts still get written into Notion).
 */
export interface Tracking {
  pageId: string;
  baseUrl: string;
}

export async function createGmailDraft(
  env: Env,
  msg: { subject: string; body: string; to?: string },
  tracking?: Tracking,
): Promise<string> {
  if (!env.GMAIL_REFRESH_TOKEN || !env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET) {
    throw new Error("Gmail not configured (missing client id/secret/refresh token)");
  }

  const accessToken = await getAccessToken(env);
  const raw = base64UrlEncode(tracking ? buildHtmlMime(msg, tracking) : buildMime(msg));

  const res = await fetchWithTimeout(
    DRAFTS_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: { raw } }),
    },
    20000,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail drafts.create HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  // The draft id isn't a stable deep-link target; link to the Drafts folder,
  // which reliably lands the user on their newly created draft.
  return "https://mail.google.com/mail/u/0/#drafts";
}

async function getAccessToken(env: Env): Promise<string> {
  const res = await fetchWithTimeout(
    TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GMAIL_CLIENT_ID,
        client_secret: env.GMAIL_CLIENT_SECRET,
        refresh_token: env.GMAIL_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }).toString(),
    },
    15000,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail token refresh HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("no access_token in Gmail token response");
  return data.access_token;
}

/** Build a minimal RFC-822 message. Subject is RFC-2047 encoded for non-ASCII. */
function buildMime(msg: { subject: string; body: string; to?: string }): string {
  const headers = [
    `To: ${headerSafe(msg.to ?? "")}`,
    `Subject: ${encodeSubject(headerSafe(msg.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${msg.body}`;
}

/** Strip CR/LF so a header value (subject/to) can't inject extra MIME headers. */
export function headerSafe(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim();
}

/** HTML message with a tracking pixel and click-wrapped links (open/click tracking). */
function buildHtmlMime(msg: { subject: string; body: string; to?: string }, t: Tracking): string {
  const base = t.baseUrl.replace(/\/$/, "");
  const pixel = `<img src="${base}/t/o/${t.pageId}" width="1" height="1" alt="" style="display:none">`;
  const headers = [
    `To: ${headerSafe(msg.to ?? "")}`,
    `Subject: ${encodeSubject(headerSafe(msg.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  const html = `<!doctype html><html><body>${bodyToHtml(msg.body, base, t.pageId)}${pixel}</body></html>`;
  return `${headers.join("\r\n")}\r\n\r\n${html}`;
}

function bodyToHtml(text: string, base: string, pageId: string): string {
  const urlRe = /(https?:\/\/[^\s<>()]+)/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(text))) {
    out += htmlEscape(text.slice(last, m.index));
    const wrapped = `${base}/t/c/${pageId}?u=${encodeURIComponent(m[1])}`;
    out += `<a href="${htmlEscape(wrapped)}">${htmlEscape(m[1])}</a>`;
    last = m.index + m[1].length;
  }
  out += htmlEscape(text.slice(last));
  return out.replace(/\n/g, "<br>\n");
}

function htmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function encodeSubject(subject: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  const bytes = new TextEncoder().encode(subject);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(binary)}?=`; // standard base64 (with padding) per RFC 2047
}
