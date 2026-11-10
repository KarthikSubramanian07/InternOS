/**
 * A tiny, self-contained status page served at `/`. No secrets, no data, just
 * confirmation the Worker is live plus links. Kept deliberately minimal so the
 * public endpoint reveals nothing about the owner.
 */
export function landingPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>InternOS</title>
<meta name="robots" content="noindex, nofollow" />
<meta name="description" content="InternOS worker status page." />
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #1e293b, #0b1120);
    color: #e2e8f0; padding: 2rem;
  }
  .skip {
    position: absolute; left: 0.75rem; top: 0.75rem;
    padding: 0.5rem 0.85rem; border-radius: 0.4rem;
    background: #0b1120; color: #7dd3fc; border: 1px solid #7dd3fc;
    text-decoration: underline; z-index: 10;
    transform: translateY(-200%);
  }
  .skip:focus { transform: none; outline: 2px solid #fbbf24; outline-offset: 2px; }
  .card {
    max-width: 30rem; width: 100%; text-align: center;
    background: #111827; border: 1px solid #334155;
    border-radius: 20px; padding: 2.5rem 2rem;
  }
  .logo { font-size: 2.75rem; }
  h1 { margin: 0.5rem 0 0.25rem; font-size: 1.5rem; letter-spacing: -0.02em; color: #f1f5f9; }
  p { margin: 0.25rem 0; color: #cbd5e1; }
  .badge {
    display: inline-flex; align-items: center; gap: 0.4rem; margin-top: 1.25rem;
    padding: 0.35rem 0.8rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600;
    background: #052e16; color: #86efac; border: 1px solid #166534;
  }
  .dot {
    width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #4ade80;
  }
  a {
    color: #7dd3fc; text-decoration: underline; text-underline-offset: 0.15em;
    display: inline-block; padding: 0.35rem 0.2rem; min-height: 24px;
  }
  a:hover { text-decoration-thickness: 2px; }
  a:focus-visible { outline: 2px solid #fbbf24; outline-offset: 2px; border-radius: 2px; }
  .foot { margin-top: 1.5rem; font-size: 0.875rem; color: #cbd5e1; }
</style>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <main id="main" class="card">
    <div class="logo" aria-hidden="true">🎯</div>
    <h1>InternOS</h1>
    <p>Your internship tracker &amp; outreach assistant is running.</p>
    <div class="badge" role="status"><span class="dot" aria-hidden="true"></span> Worker online</div>
    <p class="foot">Open-source · <a href="https://github.com/KarthikSubramanian07/InternOS">GitHub</a> · <a href="https://buymeacoffee.com/winnerkarthik">Support</a></p>
  </main>
</body>
</html>`;
}
