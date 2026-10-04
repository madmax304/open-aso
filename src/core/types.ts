// Shared domain types. Every workstream builds against these.
// DRAFT: field mapping from DataForSEO is finalized after the data spike
// (see test/fixtures/dataforseo/ for real responses).

/** A store market. v0.1 supports only the US App Store. */
export interface Market {
  /** DataForSEO location code, e.g. 2840 = United States. */
  locationCode: number;
  /** DataForSEO language code, e.g. "en". */
  languageCode: string;
}

export const US_MARKET: Market = { locationCode: 2840, languageCode: "en" };

/** Every data call returns its result together with what it cost. */
export interface Billed<T> {
  data: T;
  /** Raw DataForSEO cost in USD for this call. 0 when served from cache. */
  costUsd: number;
  cached: boolean;
}

export interface AppSummary {
  appId: string;
  title: string;
  developer?: string;
  rating?: number;
  ratingCount?: number;
  price?: number;
  iconUrl?: string;
  url?: string;
}

export interface AppDetails extends AppSummary {
  subtitle?: string;
  description?: string;
  version?: string;
  genre?: string;
  releaseDate?: string;
  lastUpdated?: string;
  screenshots?: string[];
}

/** One app in an App Store search result, with its position (1-based). */
export interface RankedApp extends AppSummary {
  position: number;
}

/** App Store search results for one keyword. */
export interface KeywordSerp {
  keyword: string;
  market: Market;
  checkedAt: string;
  results: RankedApp[];
}

/** A keyword an app ranks for (from DataForSEO Labs). */
export interface AppKeyword {
  keyword: string;
  /** Estimated monthly search volume (DataForSEO estimate). */
  searchVolume?: number;
  position?: number;
}

export interface Competitor {
  appId: string;
  /** Number of keywords shared with the target app. */
  sharedKeywords?: number;
  /** The competitor's average position across those shared keywords. */
  avgPosition?: number;
}

export interface Review {
  id: string;
  rating: number;
  title?: string;
  body: string;
  author?: string;
  date?: string;
  version?: string;
}
