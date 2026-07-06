#!/usr/bin/env node
/**
 * One-time local OAuth flow to obtain a Gmail refresh token.
 *
 * Uses the gmail.compose scope ONLY — the resulting token can create drafts but
 * physically cannot send email. Run:  npm run auth:gmail
 *
 * Prereqs: a Google Cloud OAuth client (type "Desktop app" is easiest — it allows
 * loopback redirects). Put its id/secret in .env as GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { loadEnv, must } from "./_env.mjs";

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPE = "https://www.googleapis.com/auth/gmail.compose";

const env = loadEnv();
const clientId = must(env, "GMAIL_CLIENT_ID", "Create an OAuth client (Desktop app) in Google Cloud Console.");
const clientSecret = must(env, "GMAIL_CLIENT_SECRET");

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  }).toString();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    res.writeHead(400, { "content-type": "text/html" }).end(page("❌ Authorization failed", error || "no code returned"));
    console.error("\n✖ Authorization failed:", error || "no code");
    server.close();
    process.exit(1);
  }

  try {
    const token = await exchange(code);
    if (!token.refresh_token) {
      throw new Error(
        "No refresh_token returned. Revoke prior access at https://myaccount.google.com/permissions and re-run (we request prompt=consent).",
      );
    }
    res.writeHead(200, { "content-type": "text/html" }).end(page("✅ All set!", "You can close this tab and return to your terminal."));

    console.log("\n✅ Success! Your Gmail refresh token:\n");
    console.log("   " + token.refresh_token + "\n");
    console.log("Set it as a Worker secret:\n");
    console.log("   wrangler secret put GMAIL_REFRESH_TOKEN\n");
    console.log("(paste the value above when prompted)\n");
    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/html" }).end(page("❌ Token exchange failed", String(err)));
    console.error("\n✖ Token exchange failed:", err);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log("\n🔐 Opening Google consent screen. If it doesn't open, paste this URL:\n");
  console.log("   " + authUrl + "\n");
  openBrowser(authUrl);
});

async function exchange(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

function openBrowser(url) {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
  } catch {
    /* user can paste the URL manually */
  }
}

function page(title, body) {
  return `<!doctype html><meta charset=utf-8><title>InternOS</title>
  <div style="font:16px system-ui;max-width:32rem;margin:4rem auto;text-align:center">
  <h1>${title}</h1><p style="color:#666">${body}</p></div>`;
}
