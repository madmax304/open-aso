// App picker: find an app by name or App Store link using Apple's free
// iTunes Search API. This is the ONLY non-DataForSEO call in open-aso, and it is
// used solely to find apps, never for ASO data (see SCOPE.md section 2a).

import type { AppSummary } from "../../core/types.js";

const ITUNES = "https://itunes.apple.com";

interface ItunesResult {
  trackId: number;
  trackName: string;
  sellerName?: string;
  artistName?: string;
  averageUserRating?: number;
  userRatingCount?: number;
  price?: number;
  artworkUrl100?: string;
  artworkUrl60?: string;
  trackViewUrl?: string;
}

/** Extract an App Store id from a link like apps.apple.com/us/app/name/id123456789, or a bare id. */
export function parseAppStoreId(input: string): string | null {
  const text = input.trim();
  if (/^\d{6,}$/.test(text)) return text;
  const match = text.match(/apps\.apple\.com\/.*?\bid(\d{6,})/i) ?? text.match(/\bid(\d{6,})\b/);
  return match?.[1] ?? null;
}

export interface AppSearchOptions {
  country?: string;
  limit?: number;
  fetchImpl?: typeof fetch;
}

/** Search apps by name. Accepts an App Store link or id too, in which case it looks that app up. */
export async function findApps(query: string, options: AppSearchOptions = {}): Promise<AppSummary[]> {
  const term = query.trim();
  if (!term) return [];

  const id = parseAppStoreId(term);
  if (id) {
    const app = await lookupApp(id, options);
    return app ? [app] : [];
  }

  const params = new URLSearchParams({
    term,
    entity: "software",
    country: options.country ?? "us",
    limit: String(options.limit ?? 8),
  });
  return (await itunes(`/search?${params}`, options.fetchImpl)).map(toAppSummary);
}

export async function lookupApp(appId: string, options: AppSearchOptions = {}): Promise<AppSummary | null> {
  const [first] = await lookupApps([appId], options);
  return first ?? null;
}

/** Look up several apps by id in one request (used to name competitors). */
export async function lookupApps(appIds: string[], options: AppSearchOptions = {}): Promise<AppSummary[]> {
  if (appIds.length === 0) return [];
  const params = new URLSearchParams({ id: appIds.join(","), country: options.country ?? "us" });
  return (await itunes(`/lookup?${params}`, options.fetchImpl)).map(toAppSummary);
}

async function itunes(path: string, fetchImpl: typeof fetch = fetch): Promise<ItunesResult[]> {
  const res = await fetchImpl(`${ITUNES}${path}`);
  if (res.status === 403 || res.status === 429) {
    throw new Error("Apple's search is rate limiting us. Wait a few seconds and try again.");
  }
  if (!res.ok) throw new Error(`Apple's search returned HTTP ${res.status}`);
  const json = (await res.json()) as { results?: ItunesResult[] };
  return (json.results ?? []).filter((result) => result.trackId && result.trackName);
}

function toAppSummary(result: ItunesResult): AppSummary {
  return {
    appId: String(result.trackId),
    title: result.trackName,
    developer: result.sellerName ?? result.artistName,
    rating: result.averageUserRating,
    ratingCount: result.userRatingCount,
    price: result.price,
    iconUrl: result.artworkUrl100 ?? result.artworkUrl60,
    url: result.trackViewUrl,
  };
}
