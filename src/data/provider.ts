// The data interface every feature builds on. MCP tools, CLI and UI call this,
// never DataForSEO directly. v0.1 has one implementation (DataForSEO); keeping
// the interface separate lets us add sources later without touching features.

import type {
  AppDetails,
  AppKeyword,
  Billed,
  Competitor,
  KeywordSerp,
  Market,
  Review,
} from "../core/types.js";

export interface SearchOptions {
  market?: Market;
  /** Number of results to fetch (billed per 100). Default 100. */
  depth?: number;
}

export interface ListOptions {
  market?: Market;
  limit?: number;
}

export interface KeywordsForAppOptions extends ListOptions {
  /** Only keywords where the app ranks at or above this position. */
  maxPosition?: number;
  /** Only these keywords (used to check which of a list an app ranks for). */
  keywords?: string[];
}

export interface AsoDataProvider {
  /** App Store search results for a keyword. Powers rankings and difficulty. */
  searchApps(keyword: string, options?: SearchOptions): Promise<Billed<KeywordSerp>>;

  /** Full listing details for one app. */
  getApp(appId: string, options?: { market?: Market }): Promise<Billed<AppDetails>>;

  /** Recent reviews for an app. */
  getReviews(appId: string, options?: ListOptions): Promise<Billed<Review[]>>;

  /** Keywords an app ranks for, with estimated search volume, highest volume first. */
  keywordsForApp(appId: string, options?: KeywordsForAppOptions): Promise<Billed<AppKeyword[]>>;

  /** Apps competing for the same keywords (ids only; resolve names separately). */
  appCompetitors(appId: string, options?: ListOptions): Promise<Billed<Competitor[]>>;
}
