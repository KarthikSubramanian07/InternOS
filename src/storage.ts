import type { Profile } from "./types";

/** KV keys. Profile is uploaded by `npm run setup:profile`. */
export const PROFILE_KEY = "profile";
const SEEN_KEY = "seen:jobs";
const CURSOR_KEY = "cursor:boards";

/** Keep the seen-set from growing without bound; oldest entries fall off. */
const SEEN_CAP = 50000;

/**
 * The dedupe memory: a set of job hashes we've already pushed to Notion.
 * Stored as one newline-delimited KV value — 1 read + 1 write per run, well
 * under the free-tier KV write limit (1k/day).
 */
export class SeenStore {
  private set = new Set<string>();

  constructor(private kv: KVNamespace, private key: string = SEEN_KEY) {}

  async load(): Promise<void> {
    const raw = await this.kv.get(this.key);
    if (!raw) return;
    for (const h of raw.split("\n")) if (h) this.set.add(h);
  }

  has(hash: string): boolean {
    return this.set.has(hash);
  }

  add(hash: string): void {
    this.set.add(hash);
  }

  get size(): number {
    return this.set.size;
  }

  async save(): Promise<void> {
    let arr = [...this.set];
    if (arr.length > SEEN_CAP) arr = arr.slice(arr.length - SEEN_CAP);
    await this.kv.put(this.key, arr.join("\n"));
  }
}

/** Rotating cursor over the combined company-board list. */
export async function getCursor(kv: KVNamespace): Promise<number> {
  const v = await kv.get(CURSOR_KEY);
  const n = v ? parseInt(v, 10) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function setCursor(kv: KVNamespace, n: number): Promise<void> {
  await kv.put(CURSOR_KEY, String(n));
}

const BOOSTS_KEY = "boosts:categories";

/** Categories that have converted (reached Interview/Offer) get a scoring boost. */
export async function getBoostedCategories(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(BOOSTS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

export async function setBoostedCategories(kv: KVNamespace, cats: string[]): Promise<void> {
  await kv.put(BOOSTS_KEY, JSON.stringify([...new Set(cats)]));
}

export async function loadProfile(kv: KVNamespace): Promise<Profile | null> {
  const raw = await kv.get(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Profile;
  } catch {
    console.error("profile in KV is not valid JSON");
    return null;
  }
}
