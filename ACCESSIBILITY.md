# Accessibility

Conformance target: **WCAG 2.2 Level AA**.

## What is covered

InternOS is a Cloudflare Worker. The only browser UI it serves is the public status page at `/` (`src/landing.ts`). Notion and Gmail are the day-to-day surfaces for tracking and drafts; those products bring their own accessibility. API routes (`/health`, `/webhook`, `/stats`, `/run`, `/ingest`, tracking pixels) return JSON, plain text, or a 1×1 image, not interactive pages.

## How it was checked

- axe-core (tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) on `/` at 1440×900, 390×844, and 320×800
- Keyboard tab order, visible focus, landmarks, headings, link cues that are not colour alone, target size, and `prefers-reduced-motion` for the status pulse

## Known limitations

- Email drafts staged in Gmail are HTML mail, not a web app. Recipients use their mail client's accessibility features.
- Notion board UX is outside this repo.

## Report a barrier

Open an issue on the GitHub repository describing the page or flow, the assistive technology, and what went wrong.
