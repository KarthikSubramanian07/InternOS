/**
 * A tiny, self-contained status page served at `/`. No secrets, no data — just
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
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #1e293b, #0b1120);
    color: #e2e8f0; padding: 2rem;
  }
  .card {
    max-width: 30rem; width: 100%; text-align: center;
    background: rgba(148, 163, 184, 0.08); border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 20px; padding: 2.5rem 2rem; backdrop-filter: blur(8px);
  }
  .logo { font-size: 2.75rem; }
  h1 { margin: 0.5rem 0 0.25rem; font-size: 1.5rem; letter-spacing: -0.02em; }
  p { margin: 0.25rem 0; color: #94a3b8; }
  .badge {
    display: inline-flex; align-items: center; gap: 0.4rem; margin-top: 1.25rem;
    padding: 0.35rem 0.8rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600;
    background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3);
  }
  .dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #4ade80; box-shadow: 0 0 0 0 rgba(74,222,128,0.6); animation: pulse 2s infinite; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(74,222,128,0.5);} 70% { box-shadow: 0 0 0 8px rgba(74,222,128,0);} 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0);} }
  a { color: #7dd3fc; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .foot { margin-top: 1.5rem; font-size: 0.8rem; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">🎯</div>
    <h1>InternOS</h1>
    <p>Your internship tracker &amp; outreach assistant is running.</p>
    <div class="badge"><span class="dot"></span> Worker online</div>
    <p class="foot">Open-source · <a href="https://github.com/KarthikSubramanian07/InternOS">GitHub</a> · <a href="https://buymeacoffee.com/winnerkarthik">☕ Support</a></p>
  </div>
</body>
</html>`;
}
