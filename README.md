<div align="center">

# 🎯 InternOS

### Your internship hunt, on autopilot — for $0.

**InternOS scrapes thousands of internship listings, drops the ones you care about into a beautiful Notion board, and — the moment you tick a checkbox — writes you a tailored resume, cover letter, and recruiter email, then stages a Gmail draft ready to send.**

You bring a resume and a Groq key. It brings the grind.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Runs on](https://img.shields.io/badge/runs%20on-Cloudflare%20Workers-orange.svg)
![Cost](https://img.shields.io/badge/cost-%240%2Fmo-brightgreen.svg)
![LLM](https://img.shields.io/badge/LLM-Groq%20(BYO%20key)-8A2BE2.svg)

</div>

---

## Why this exists

Applying to internships is two jobs: **finding the postings** and **writing the applications**. Both are soul-crushing at scale, and both are automatable — so InternOS automates them, without ever sending anything on your behalf or leaking your data.

- 🔎 **Finds roles for you.** Pulls from Greenhouse, Lever, and Ashby job boards plus five community-maintained GitHub internship lists (Simplify, vanshb03, speedyapply ×2, northwesternfintech). Thousands of listings, deduped and categorized.
- 🗂️ **Organizes them in Notion.** A clean, color-coded database you actually enjoy looking at — filter by category, track status Kanban-style, see what's fresh.
- ✍️ **Drafts your application in one click.** Check a box → Groq writes resume bullets, a cover letter, and a recruiter email *tailored to that exact role and your background* — then stages a Gmail draft. You review and hit send. Always you.
- 🆓 **Costs nothing.** Everything runs on free tiers: Cloudflare Workers (compute + cron), Cloudflare KV (storage), Groq (LLM), Notion, Gmail API.
- 🔒 **Keeps your data yours.** The code is open-source and public. *Your resume, preferences, and keys never touch the repo* — they live only in your own Cloudflare account.

---

## The one big idea: public core, private you

InternOS is split down the middle, on purpose:

| 🌐 **Public repo** (this repo, MIT) | 🔐 **Private to you** (never committed) |
| --- | --- |
| Scrapers, parsers, filters, Notion sync, webhook handler, drafting prompts, Gmail glue | Your resume text, name, school, preferences (`private-config.json`) |
| Config *shape* and seed company lists | Your Notion token, Groq key, Gmail token (Cloudflare **secrets**) |
| Zero personal data. Zero credentials. | Stored in **your** Cloudflare KV + secret store |

A stranger can clone this repo and have a fully working tool the moment they drop in their own `private-config.json` and set their own secrets. That's what makes it genuinely shareable — **there's nothing of yours in here to leak.**

> ### 🔑 On API keys (the "how do OSS projects handle this?" question)
> The standard, correct answer: **bring-your-own-key (BYO).** InternOS never ships a key and never proxies through a shared one — that would cost the maintainer money and be a security nightmare. Instead, *each user* creates a **free** Groq account (10 seconds, no credit card) and sets their own key as a Cloudflare secret. Same for Notion and Gmail. Your keys, your quotas, your control. Groq's free tier (30 req/min, 1,000 req/day on Llama 3.3 70B) is *wildly* more than one person applying to internships will ever touch.

---

## How it works

```
                        ┌──────── Cloudflare Worker (free tier) ────────┐
   ⏰ Cron (2×/day) ───► │  scrape → categorize → dedupe → push to Notion │
                        └───────────────────────────────────────────────┘
                                             │
   Greenhouse ┐                              ▼
   Lever      ┼─► normalized ────────► ┌─────────────┐    you browse & filter
   Ashby      ┘   {company, role,      │  📋 Notion   │◄──────────────────────  🧑 you
   GitHub ×5 ─►    location, url, ...}  │   database   │
                                        └─────────────┘
                                             │  ☑️ you tick "Apply"
                                             ▼
                        ┌──────── Cloudflare Worker (webhook) ──────────┐
   ☑️ Notion automation ─► verify secret → fetch role → Groq drafts →   │
                        │  write drafts back to Notion + stage Gmail draft │
                        └───────────────────────────────────────────────┘
```

The LLM is used **only** for drafting — never for scraping or filtering (that's fast, free, rule-based keyword matching). No wasted tokens, no rate-limit risk on the crawl.

---

## Prerequisites

All free. Grab these before you start:

1. **[Node.js](https://nodejs.org) 18+** and this repo cloned locally.
2. **A [Cloudflare account](https://dash.cloudflare.com/sign-up)** (free) + the Wrangler CLI (`npm i` installs it here).
3. **A [Notion account](https://notion.so)** + an internal integration.
4. **A [Groq API key](https://console.groq.com/keys)** (free, no card).
5. *(Optional but recommended)* **A [Google Cloud project](https://console.cloud.google.com)** for Gmail draft creation.

---

## Setup — start to finish (~20 minutes)

### 0. Clone & install

```bash
git clone https://github.com/your-username/internos.git
cd internos
npm install
cp .env.example .env                      # for local dev + the setup scripts
cp private-config.example.json private-config.json
wrangler login                            # opens a browser to auth Cloudflare
```

### 1. Create your KV namespace

This is where the dedupe memory and your profile live.

```bash
wrangler kv namespace create JOBS
```

Copy the returned `id` (and create a `preview_id` with `--preview` if you want `wrangler dev`) into **`wrangler.toml`**, replacing the `REPLACE_WITH_YOUR_...` placeholders.

### 2. Set up Notion

1. Create an **internal integration** at [notion.so/my-integrations](https://www.notion.so/my-integrations) → copy the **token** (`secret_...`).
2. In Notion, make (or pick) a page to hold your tracker. Open it → **•••** → **Connections** → add your integration. Copy the page's ID from its URL (the 32-char hex chunk).
3. Put the token in `.env` as `NOTION_TOKEN`, then create the database:

```bash
npm run setup:notion <YOUR_PARENT_PAGE_ID>
```

This builds a **polished, color-coded database** — Category / Status / Source selects with sensible colors, an Apply ☑️ checkbox, draft fields, and a 🎯 icon. It prints your new **database ID** and suggests the nicest views to add (Kanban by Status, table grouped by Category, an "active outreach" filter).

4. Save the token + database ID as secrets (and drop them in `.env` for local runs):

```bash
wrangler secret put NOTION_TOKEN          # paste your integration token
wrangler secret put NOTION_DATABASE_ID    # paste the id setup:notion printed
```

### 3. Add your Groq key

```bash
wrangler secret put GROQ_API_KEY          # paste from console.groq.com/keys
```

### 4. Set a webhook secret

This guards your webhook + manual-run endpoints. Generate something random:

```bash
openssl rand -hex 24                       # copy the output
wrangler secret put WEBHOOK_SECRET         # paste it
```

### 5. *(Optional)* Wire up Gmail drafts

Skip this and everything still works — you just won't get auto-staged Gmail drafts (the email text still lands in Notion). To enable:

1. In [Google Cloud Console](https://console.cloud.google.com): create a project → enable the **Gmail API** → create an **OAuth client ID** of type **Desktop app**.
2. Put the client id/secret in `.env` as `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`.
3. Run the one-time consent flow to mint a refresh token:

```bash
npm run auth:gmail
```

It opens Google's consent screen (requesting **only** `gmail.compose` — draft creation, **never** send), then prints your refresh token. Save all three as secrets:

```bash
wrangler secret put GMAIL_CLIENT_ID
wrangler secret put GMAIL_CLIENT_SECRET
wrangler secret put GMAIL_REFRESH_TOKEN
```

> 🛡️ **By design, InternOS physically cannot send email.** It only ever requests the `gmail.compose` scope, so the worst it can do is leave a draft in *your* Drafts folder. You add the recipient and hit send. Always.

### 6. Fill in your profile & upload it

Edit **`private-config.json`** — your name, school, grad year, resume text, target categories/locations, and writing tone. (See [`config.schema.json`](config.schema.json) for every field.) Then:

```bash
npm run setup:profile
```

This uploads it to *your* KV under the key `profile`. It never leaves your Cloudflare account and is `.gitignore`d locally.

### 7. Deploy 🚀

```bash
npm run deploy
```

Wrangler prints your Worker URL, e.g. `https://internos.<you>.workers.dev`.

### 8. *(Optional)* Connect the Notion → Worker webhook for **instant** drafting

**You can skip this entirely.** A cron poll runs every ~10 minutes and drafts any `Apply ✅`-checked row automatically — so checking a box gets you drafts within minutes with **zero Notion-UI setup**. Set up the webhook only if you want *instant* (sub-second) drafting:

1. Open your Notion database → **•••** → **Automations** → **+ New automation**.
2. Trigger: **`Apply ✅` is checked** (property changed to true).
3. Action: **Send webhook** → URL:

   ```
   https://internos.<you>.workers.dev/webhook/notion?token=YOUR_WEBHOOK_SECRET
   ```

   (Use the exact `WEBHOOK_SECRET` from step 4. This is how the Worker knows the request is really from your Notion.)

> ℹ️ The "Send webhook" automation action requires a paid Notion plan on some workspaces. If you don't have it, just skip this step — the poll fallback covers you on the free plan.

### 9. Try it 🎉

```bash
# Kick off a scrape immediately (don't wait for cron):
curl -X POST "https://internos.<you>.workers.dev/run?token=YOUR_WEBHOOK_SECRET"
```

Watch rows appear in Notion. Then **tick the `Apply ✅` box on any row** — within a few seconds the Resume Draft, Cover Letter Draft, and Recruiter Email Draft fields fill in, and (if you set up Gmail) a draft link appears. Done.

---

## Make it yours

Everything worth tuning is a plain config file or an env var — **no code changes needed.**

| I want to… | Edit |
| --- | --- |
| Add/remove role categories or keywords (add "PM", "Data Science", drop "EE") | [`config/categories.json`](config/categories.json) |
| Track more companies | [`config/companies-greenhouse.json`](config/companies-greenhouse.json), `-lever.json`, `-ashby.json` |
| Change *your* target categories, locations, tone, resume | `private-config.json` → re-run `npm run setup:profile` |
| Scrape more/less often | `crons` in [`wrangler.toml`](wrangler.toml) |
| Use a different Groq model | `GROQ_MODEL` in `wrangler.toml` |
| Include non-intern roles too | set `INTERNSHIPS_ONLY = "false"` |
| Rename the Notion columns | [`config/notion-schema.json`](config/notion-schema.json) (before running `setup:notion`) |

> **Finding a company's board token:** it's the slug in their careers URL — `boards.greenhouse.io/`**`stripe`**, `jobs.lever.co/`**`palantir`**, `jobs.ashbyhq.com/`**`openai`**. Add it to the matching JSON list. The seed lists are a starting point; extend them freely (some tokens may 404 — that's fine, they're skipped silently).

---

## About the free tier (important, and honest)

Cloudflare's **free** Workers plan allows **50 subrequests per invocation**. Scraping 150+ company boards *and* creating Notion rows would blow past that in a single run, so InternOS is built to stay under budget:

- **GitHub lists run every time** — ~7 fetches for thousands of listings. Best yield per subrequest by far.
- **Company boards rotate.** Each run scans a window of `BOARD_FETCHES_PER_RUN` (default 20) boards, advancing a cursor stored in KV. Over several runs, the whole list gets covered.
- **New Notion rows are capped** at `MAX_NEW_PER_RUN` (default 20) per run; the rest are picked up next run (they're only marked "seen" once actually created).

**So the first day or two is a warm-up** — coverage builds run by run, then settles into a steady trickle of genuinely new postings. Want it faster? The [Workers Paid plan](https://developers.cloudflare.com/workers/platform/pricing/) ($5/mo) raises the limit to 1,000 subrequests — bump both env vars way up and it covers everything each run.

Groq's free tier (1,000 req/day) and KV's free tier (100k reads / 1k writes per day) are never close to a constraint at one-human scale.

---

## Project layout

```
internos/
├── src/
│   ├── index.ts              # Worker entry: cron + HTTP router
│   ├── cron.ts               # orchestrates a scrape run (rotation, budget)
│   ├── scraper/              # greenhouse.ts · lever.ts · ashby.ts · html.ts
│   ├── sources/              # GitHub list parsers (+ parseMarkdownTable.ts core)
│   ├── filters/categorize.ts # rule-based (no-LLM) categorization + filtering
│   ├── notion/               # client.ts · sync.ts · schema.ts
│   ├── webhook/handler.ts    # Apply ✅ → draft everything (idempotent)
│   ├── drafting/groq.ts      # structured-JSON drafting
│   ├── gmail/drafts.ts       # compose-only draft creation
│   ├── storage.ts            # KV: seen-set, cursor, profile
│   └── util.ts               # hashing, timeouts, base64url, helpers
├── config/                   # categories, company lists, notion schema (all editable)
├── scripts/                  # setup-notion · upload-profile · gmail-oauth (local, Node)
├── config.schema.json        # documents private-config.json
├── private-config.example.json
└── wrangler.toml
```

---

## Troubleshooting

<details>
<summary><b>No rows appear after <code>/run</code></b></summary>

- Did you upload your profile? `npm run setup:profile` — the scrape no-ops without it.
- Check logs: `wrangler tail`. Look for the `InternOS scrape:` summary line.
- If `matched=0`, your `targetCategories`/`locations` filters may be too narrow. Empty the arrays to keep everything, or widen keywords in `categories.json`.
- Early runs create few rows by design (see *free tier* above) — give it a few cron cycles.
</details>

<details>
<summary><b>Ticking Apply ✅ doesn't draft anything</b></summary>

- Confirm the automation URL includes `?token=YOUR_WEBHOOK_SECRET` and it matches your secret exactly (403 = mismatch).
- `wrangler tail` and watch for `drafting failed:` — usually a missing `GROQ_API_KEY` or profile.
- Re-firing is idempotent for 24h. To force a re-draft, uncheck and re-check the box (a failed attempt clears the guard automatically).
</details>

<details>
<summary><b><code>npm run auth:gmail</code> gives no refresh token</b></summary>

Google only returns a refresh token on first consent. Revoke prior access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions) and re-run — we always request `prompt=consent`.
</details>

<details>
<summary><b>Notion setup fails with <code>object_not_found</code></b></summary>

You didn't share the parent page with your integration. Open the page → **•••** → **Connections** → add it, then re-run `npm run setup:notion <page_id>`.
</details>

---

## Contributing

PRs welcome — especially new/updated company board tokens, additional GitHub source parsers, and category keyword improvements. The scrape path is intentionally LLM-free; please keep it that way. Run `npm run typecheck` before opening a PR.

## License

[MIT](LICENSE) — do whatever you want, just don't blame us. Built for students, by people who remember the grind. ❤️
