/** Minimal HTML → plain text for job descriptions (no DOM in Workers). */
export function stripHtml(html: string | null | undefined, maxLen = 4000): string {
  if (!html) return "";
  // Decode entities FIRST (twice) — some boards (Greenhouse) return their HTML
  // entity-encoded, e.g. "&lt;p&gt;". Decoding before stripping turns those back
  // into real tags so they get removed instead of surfacing as literal "<p>" text.
  let text = decodeEntities(decodeEntities(html));
  text = text
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr|ul|ol)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&#0?39;|&#x27;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&#0?34;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&hellip;/gi, "…")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}
