/**
 * Rule-based quality / ghost-job flags, computed cheaply from a single listing.
 * Catches the classic "not a real opening" patterns (evergreen talent-pool posts)
 * and thin listings. Cross-run repost counting is intentionally out of scope to
 * keep the scrape path stateless and within the CPU budget.
 */
export function jobFlags(job: { role: string; description?: string }): string {
  const flags: string[] = [];
  const text = `${job.role} ${job.description ?? ""}`.toLowerCase();

  if (
    /\b(evergreen|talent (?:pool|community|network)|general application|future opportunit|always (?:hiring|accepting)|expression of interest|spontaneous application|join our (?:pipeline|talent))\b/.test(
      text,
    )
  ) {
    flags.push("Evergreen/pipeline");
  }

  const desc = (job.description ?? "").trim();
  if (desc.length > 0 && desc.length < 200) flags.push("Sparse description");

  return flags.join("; ");
}
