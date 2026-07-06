/**
 * Shared types for InternOS.
 *
 * `Category` is intentionally a plain string, not a fixed union — categories are
 * fully user-defined in config/categories.json and the user's profile. Nothing
 * in the code path hardcodes "SWE"/"AI-ML"/etc.
 */

export type Category = string;

/** A single normalized job listing — the common schema every source maps into. */
export interface Job {
  company: string;
  role: string;
  location: string;
  category: Category;
  url: string;
  /** ISO date string (YYYY-MM-DD) or null when the source doesn't provide one. */
  datePosted: string | null;
  /** Optional longer text, fed to the LLM at drafting time when available. */
  description?: string;
  /** Provenance: "greenhouse" | "lever" | "ashby" | "github:<repo>". */
  source: string;
}

/**
 * A job as produced by a scraper, before categorization assigns `category`.
 * `categoryHint` lets single-topic sources (e.g. an AI-only GitHub list) suggest
 * a category when keyword matching on the title alone is inconclusive.
 */
export type RawJob = Omit<Job, "category"> & { categoryHint?: string };

/** category name -> list of lowercase keyword substrings that map a title into it. */
export type CategoryConfig = Record<string, string[]>;

/** The per-user profile stored in KV under key "profile". See config.schema.json. */
export interface Profile {
  name: string;
  email?: string;
  phone?: string;
  school?: string;
  gradYear?: number;
  links?: Record<string, string>;
  resumeText: string;
  /** Category names to keep. Empty array = keep all categories. */
  targetCategories: string[];
  /** Preferred location substrings. Empty/absent = no location filtering. */
  locations?: string[];
  remotePreference?: "any" | "remote" | "onsite" | "hybrid";
  tone?: string;
}

/** Worker bindings (KV + vars + secrets). */
export interface Env {
  // KV
  JOBS: KVNamespace;

  // vars (wrangler.toml [vars])
  GROQ_MODEL: string;
  INTERNSHIPS_ONLY: string;
  BOARD_FETCHES_PER_RUN: string;
  MAX_NEW_PER_RUN: string;

  // secrets (wrangler secret put ...)
  NOTION_TOKEN: string;
  NOTION_DATABASE_ID: string;
  GROQ_API_KEY: string;
  GMAIL_CLIENT_ID: string;
  GMAIL_CLIENT_SECRET: string;
  GMAIL_REFRESH_TOKEN: string;
  WEBHOOK_SECRET: string;
}

/** Structured JSON the drafting model is required to return. */
export interface DraftResult {
  resume_bullets: string[];
  cover_letter: string;
  recruiter_email: {
    subject: string;
    body: string;
  };
}
