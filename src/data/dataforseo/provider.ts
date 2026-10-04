// AsoDataProvider backed by DataForSEO. Maps raw responses (see
// test/fixtures/dataforseo/) to open-aso's types. No caching or spend logic
// here; MeteredProvider wraps this.

import { type AppDetails, type AppKeyword, type Billed, type Competitor, type KeywordSerp, type Market, type RankedApp, type Review, US_MARKET } from "../../core/types.js";
import type { AsoDataProvider, KeywordsForAppOptions, ListOptions, SearchOptions } from "../provider.js";
import type { DataForSeoClient } from "./client.js";

const HIGH_PRIORITY = 2;

/* Raw DataForSEO shapes: only the fields we use. */
interface RawRating { value?: number | null; votes_count?: number | null }
interface RawAppItem {
  rank_absolute?: number;
  app_id?: string;
  title?: string;
  subtitle?: string | null;
  url?: string;
  icon?: string;
  description?: string | null;
  reviews_count?: number | null;
  rating?: RawRating | null;
  price?: { current?: number | null } | number | null;
  developer?: string | null;
  version?: string | null;
  main_category?: string | null;
  released_date?: string | null;
  last_update_date?: string | null;
  images?: string[] | null;
}
interface RawReview {
  id?: string;
  rating?: RawRating | null;
  title?: string | null;
  review_text?: string | null;
  timestamp?: string | null;
  version?: string | null;
  user_profile?: { profile_name?: string | null } | null;
}
interface RawKeywordItem {
  keyword_data?: { keyword?: string; keyword_info?: { search_volume?: number | null } };
  ranked_serp_element?: { serp_item?: { rank_absolute?: number } };
}
interface RawCompetitor { app_id?: string; avg_position?: number; intersections?: number }
interface ItemsResult<T> { items?: T[] | null }

export class DataForSeoProvider implements AsoDataProvider {
  constructor(private readonly client: DataForSeoClient) {}

  async searchApps(keyword: string, options: SearchOptions = {}): Promise<Billed<KeywordSerp>> {
    const market = options.market ?? US_MARKET;
    const { result, costUsd } = await this.client.task<ItemsResult<RawAppItem>>("/v3/app_data/apple/app_searches", {
      keyword, ...marketParams(market), depth: options.depth ?? 100, priority: HIGH_PRIORITY,
    });
    const results = (result?.items ?? []).map(toRankedApp).filter((app): app is RankedApp => app !== null);
    return { data: { keyword, market, checkedAt: new Date().toISOString(), results }, costUsd, cached: false };
  }

  async getApp(appId: string, options: { market?: Market } = {}): Promise<Billed<AppDetails>> {
    const { result, costUsd } = await this.client.task<ItemsResult<RawAppItem>>("/v3/app_data/apple/app_info", {
      app_id: appId, ...marketParams(options.market ?? US_MARKET), priority: HIGH_PRIORITY,
    });
    const item = result?.items?.[0];
    if (!item) throw new Error(`DataForSEO found no App Store listing for app ${appId}.`);
    const details: AppDetails = {
      ...toAppSummary(item, appId),
      subtitle: item.subtitle ?? undefined,
      description: item.description ?? undefined,
      version: item.version?.replace(/^Version\s+/i, "") ?? undefined,
      genre: item.main_category ?? undefined,
      releaseDate: item.released_date ?? undefined,
      lastUpdated: item.last_update_date ?? undefined,
      screenshots: item.images ?? undefined,
    };
    return { data: details, costUsd, cached: false };
  }

  async getReviews(appId: string, options: ListOptions = {}): Promise<Billed<Review[]>> {
    const { result, costUsd } = await this.client.task<ItemsResult<RawReview>>("/v3/app_data/apple/app_reviews", {
      app_id: appId, ...marketParams(options.market ?? US_MARKET), depth: options.limit ?? 50, priority: HIGH_PRIORITY,
    });
    const reviews = (result?.items ?? []).map((item): Review => ({
      id: String(item.id ?? ""),
      rating: item.rating?.value ?? 0,
      title: item.title ?? undefined,
      body: item.review_text ?? "",
      author: item.user_profile?.profile_name ?? undefined,
      date: item.timestamp ?? undefined,
      version: item.version ?? undefined,
    }));
    return { data: reviews, costUsd, cached: false };
  }

  async keywordsForApp(appId: string, options: KeywordsForAppOptions = {}): Promise<Billed<AppKeyword[]>> {
    const filters: unknown[] = [];
    if (options.maxPosition) filters.push(["ranked_serp_element.serp_item.rank_absolute", "<=", options.maxPosition]);
    if (options.keywords?.length) {
      if (filters.length) filters.push("and");
      filters.push(["keyword_data.keyword", "in", options.keywords.map((keyword) => keyword.toLowerCase())]);
    }
    const { result, costUsd } = await this.client.live<ItemsResult<RawKeywordItem>>("/v3/dataforseo_labs/apple/keywords_for_app/live", {
      app_id: appId,
      ...marketParams(options.market ?? US_MARKET),
      limit: options.limit ?? 50,
      order_by: ["keyword_data.keyword_info.search_volume,desc"],
      ...(filters.length ? { filters } : {}),
    });
    const keywords = (result?.items ?? [])
      .map((item): AppKeyword | null => {
        const keyword = item.keyword_data?.keyword;
        if (!keyword || !isCleanKeyword(keyword)) return null;
        return {
          keyword,
          searchVolume: item.keyword_data?.keyword_info?.search_volume ?? undefined,
          position: item.ranked_serp_element?.serp_item?.rank_absolute,
        };
      })
      .filter((keyword): keyword is AppKeyword => keyword !== null);
    return { data: keywords, costUsd, cached: false };
  }

  async appCompetitors(appId: string, options: ListOptions = {}): Promise<Billed<Competitor[]>> {
    const { result, costUsd } = await this.client.live<ItemsResult<RawCompetitor>>("/v3/dataforseo_labs/apple/app_competitors/live", {
      app_id: appId, ...marketParams(options.market ?? US_MARKET), limit: (options.limit ?? 10) + 1,
    });
    const competitors = (result?.items ?? [])
      .filter((item) => item.app_id && item.app_id !== appId)
      .slice(0, options.limit ?? 10)
      .map((item): Competitor => ({
        appId: String(item.app_id),
        sharedKeywords: item.intersections,
        avgPosition: item.avg_position === undefined ? undefined : Math.round(item.avg_position * 10) / 10,
      }));
    return { data: competitors, costUsd, cached: false };
  }
}

function marketParams(market: Market) {
  return { location_code: market.locationCode, language_code: market.languageCode };
}

function toAppSummary(item: RawAppItem, fallbackId = "") {
  const price = typeof item.price === "number" ? item.price : item.price?.current ?? undefined;
  return {
    appId: String(item.app_id ?? fallbackId),
    title: item.title ?? "",
    developer: item.developer ?? undefined,
    rating: item.rating?.value ?? undefined,
    ratingCount: item.rating?.votes_count ?? item.reviews_count ?? undefined,
    price: price ?? undefined,
    iconUrl: item.icon,
    url: item.url,
  };
}

function toRankedApp(item: RawAppItem): RankedApp | null {
  if (!item.app_id || item.rank_absolute === undefined) return null;
  return { ...toAppSummary(item), position: item.rank_absolute };
}

/** Drop malformed keywords seen in Labs data, e.g. "instagram##". */
export function isCleanKeyword(keyword: string): boolean {
  return /^[\p{L}\p{N}][\p{L}\p{N} '&.+-]*$/u.test(keyword.trim());
}
