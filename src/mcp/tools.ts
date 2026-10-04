// The 7 open-aso tools as plain functions. src/mcp/server.ts exposes them over
// MCP; the CLI and UI can call them directly. Every result includes what the
// call cost (cost_usd), whether it came from cache, and spend today.

import type { AppSummary, AppDetails, Billed, Review } from "../core/types.js";
import type { OpenAsoConfig } from "../core/config.js";
import type { Store } from "../db/store.js";
import type { AsoDataProvider } from "../data/provider.js";
import { type AppFinder, resolveApp } from "../aso/resolve.js";
import { keywordDifficulty } from "../aso/difficulty.js";
import { validateMetadata, type MetadataInput } from "../metadata/validate.js";

export interface ToolContext {
  store: Store;
  config: OpenAsoConfig;
  /** null when DataForSEO isn't connected; free tools still work. */
  provider: AsoDataProvider | null;
  finder: AppFinder & { lookupApps: (appIds: string[]) => Promise<AppSummary[]> };
}

export class ToolError extends Error {}

const MAX_KEYWORDS_PER_CALL = 25;

// ---------- keywords ----------

export interface KeywordsArgs {
  app?: string;
  keywords?: string[];
  limit?: number;
  max_position?: number;
  with_difficulty?: boolean;
}

export async function keywordsTool(ctx: ToolContext, args: KeywordsArgs) {
  return withCost(ctx, async (provider) => {
    // Mode B: research specific keywords (difficulty, who ranks, volume).
    if (args.keywords?.length) {
      const list = uniqueKeywords(args.keywords).slice(0, MAX_KEYWORDS_PER_CALL);
      const own = ctx.config.apps[0];
      const rows = await mapLimit(list, 3, async (keyword) => {
        const serp = (await provider.searchApps(keyword)).data;
        const difficulty = keywordDifficulty(keyword, serp.results);
        const leader = serp.results[0];
        // Labs only knows volume for keywords an app ranks for, so ask about the #1 app.
        const volume = leader
          ? (await provider.keywordsForApp(leader.appId, { keywords: [keyword], limit: 1 })).data[0]?.searchVolume
          : undefined;
        return {
          keyword,
          search_volume: volume ?? null,
          difficulty: difficulty.score,
          difficulty_tier: difficulty.tier,
          your_position: own ? serp.results.find((app) => app.appId === own.appId)?.position ?? null : undefined,
          top_apps: serp.results.slice(0, 5).map(appBrief),
        };
      });
      return { keywords: rows, notes: notesForKeywords(args.keywords.length) };
    }

    // Mode A: keywords an app already ranks for.
    const resolved = await resolveApp(args.app, ctx.config.apps, ctx.finder);
    const limit = clamp(args.limit ?? 30, 1, 200);
    const keywords = (await provider.keywordsForApp(resolved.app.appId, { limit, maxPosition: args.max_position })).data;

    let difficulties = new Map<string, { score: number; tier: string }>();
    if (args.with_difficulty) {
      const top = keywords.slice(0, 10);
      const scored = await mapLimit(top, 3, async (keyword) => {
        const serp = (await provider.searchApps(keyword.keyword)).data;
        const difficulty = keywordDifficulty(keyword.keyword, serp.results);
        return [keyword.keyword, { score: difficulty.score, tier: difficulty.tier }] as const;
      });
      difficulties = new Map(scored);
    }

    return {
      app: appBrief(resolved.app),
      other_matches: resolved.otherMatches,
      keywords: keywords.map((keyword) => ({
        keyword: keyword.keyword,
        search_volume: keyword.searchVolume ?? null,
        position: keyword.position ?? null,
        ...(difficulties.has(keyword.keyword)
          ? { difficulty: difficulties.get(keyword.keyword)!.score, difficulty_tier: difficulties.get(keyword.keyword)!.tier }
          : {}),
      })),
      notes: [
        "search_volume is DataForSEO's monthly estimate for the US App Store.",
        ...(args.with_difficulty ? ["Difficulty was calculated for the top 10 keywords by volume."] : ["Pass with_difficulty: true to score the top 10 keywords (about $0.0024 each)."]),
      ],
    };
  });
}

// ---------- rankings ----------

export interface RankingsArgs {
  app?: string;
  keywords?: string[];
  history?: boolean;
}

export async function rankingsTool(ctx: ToolContext, args: RankingsArgs) {
  return withCost(ctx, async (provider) => {
    const resolved = await resolveApp(args.app, ctx.config.apps, ctx.finder);
    const appId = resolved.app.appId;
    const keywords = uniqueKeywords(args.keywords?.length ? args.keywords : ctx.store.trackedKeywords()).slice(0, MAX_KEYWORDS_PER_CALL);
    if (keywords.length === 0) {
      throw new ToolError("No keywords given and none are tracked yet. Pass keywords, or add some with the track tool.");
    }

    const rows = await mapLimit(keywords, 3, async (keyword) => {
      const { data: serp, cached } = await provider.searchApps(keyword);
      const position = serp.results.find((app) => app.appId === appId)?.position ?? null;
      const previous = ctx.store.rankHistory(appId, keyword, 1)[0];
      if (!cached) ctx.store.saveRank(appId, keyword, position);
      const change = previous && previous.position !== null && position !== null ? previous.position - position : null;
      return {
        keyword,
        position,
        previous_position: previous?.position ?? null,
        change,
        leader: serp.results[0] ? appBrief(serp.results[0]) : null,
        ...(args.history ? { history: ctx.store.rankHistory(appId, keyword, 30) } : {}),
      };
    });

    return {
      app: appBrief(resolved.app),
      other_matches: resolved.otherMatches,
      rankings: rows,
      notes: [
        "position is the rank in US App Store search (top 100). null = not in the top 100.",
        "change is positive when the app moved up since the previous saved check.",
      ],
    };
  });
}

// ---------- app ----------

export async function appTool(ctx: ToolContext, args: { app?: string }) {
  return withCost(ctx, async (provider) => {
    const resolved = await resolveApp(args.app, ctx.config.apps, ctx.finder);
    const { data: details, cached } = await provider.getApp(resolved.app.appId);
    const previous = ctx.store.latestAppSnapshot<AppDetails>(details.appId);
    const changes = previous ? diffListing(previous.data, details) : [];
    if (!cached && (!previous || changes.length)) ctx.store.saveAppSnapshot(details.appId, details);
    return {
      app: details,
      other_matches: resolved.otherMatches,
      changes_since_last_check: previous ? { since: previous.capturedAt, changes } : null,
    };
  });
}

// ---------- competitors ----------

export async function competitorsTool(ctx: ToolContext, args: { app?: string; competitor?: string; limit?: number }) {
  return withCost(ctx, async (provider) => {
    const resolved = await resolveApp(args.app, ctx.config.apps, ctx.finder);
    const appId = resolved.app.appId;

    if (args.competitor) {
      const rival = await resolveApp(args.competitor, [], ctx.finder);
      const rivalKeywords = (await provider.keywordsForApp(rival.app.appId, { limit: 100, maxPosition: 20 })).data;
      const yours = rivalKeywords.length
        ? (await provider.keywordsForApp(appId, { keywords: rivalKeywords.map((k) => k.keyword), limit: 100 })).data
        : [];
      const yourPositions = new Map(yours.map((k) => [k.keyword.toLowerCase(), k.position]));
      const rows = rivalKeywords.map((keyword) => ({
        keyword: keyword.keyword,
        search_volume: keyword.searchVolume ?? null,
        competitor_position: keyword.position ?? null,
        your_position: yourPositions.get(keyword.keyword.toLowerCase()) ?? null,
      }));
      return {
        app: appBrief(resolved.app),
        competitor: appBrief(rival.app),
        keyword_gap: rows.filter((row) => row.your_position === null),
        competitor_ahead: rows.filter((row) => row.your_position !== null && row.competitor_position !== null && row.competitor_position < row.your_position),
        you_ahead: rows.filter((row) => row.your_position !== null && row.competitor_position !== null && row.your_position <= row.competitor_position),
        notes: ["Based on the competitor's top 100 keywords (by volume) where it ranks in the top 20."],
      };
    }

    const limit = clamp(args.limit ?? 10, 1, 25);
    const competitors = (await provider.appCompetitors(appId, { limit })).data;
    const named = await ctx.finder.lookupApps(competitors.map((c) => c.appId)).catch(() => [] as AppSummary[]);
    const byId = new Map(named.map((app) => [app.appId, app]));
    return {
      app: appBrief(resolved.app),
      competitors: competitors.map((competitor) => ({
        ...appBrief(byId.get(competitor.appId) ?? { appId: competitor.appId, title: `App ${competitor.appId}` }),
        shared_keywords: competitor.sharedKeywords ?? null,
        avg_position_on_shared_keywords: competitor.avgPosition ?? null,
      })),
      notes: ["Pass competitor to get the keyword gap between your app and one competitor."],
    };
  });
}

// ---------- reviews ----------

export async function reviewsTool(ctx: ToolContext, args: { app?: string; limit?: number }) {
  return withCost(ctx, async (provider) => {
    const resolved = await resolveApp(args.app, ctx.config.apps, ctx.finder);
    const reviews: Review[] = (await provider.getReviews(resolved.app.appId, { limit: clamp(args.limit ?? 50, 1, 200) })).data;
    const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: reviews.filter((r) => Math.round(r.rating) === stars).length }));
    const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;
    return {
      app: appBrief(resolved.app),
      summary: { count: reviews.length, average_rating: average === null ? null : Math.round(average * 100) / 100, distribution },
      reviews,
      notes: ["These are the most recent US App Store reviews. Summarize themes, complaints and feature requests from them."],
    };
  });
}

// ---------- track (free) ----------

export interface TrackArgs {
  action: "add" | "remove" | "list";
  apps?: string[];
  competitors?: string[];
  keywords?: string[];
}

export async function trackTool(ctx: ToolContext, args: TrackArgs) {
  const { store } = ctx;
  if (args.action !== "list") {
    for (const [list, isOwn] of [[args.apps ?? [], true], [args.competitors ?? [], false]] as const) {
      for (const input of list) {
        const { app } = await resolveApp(input, ctx.config.apps, ctx.finder);
        if (args.action === "add") store.trackApp(app.appId, app.title, isOwn);
        else store.untrackApp(app.appId);
      }
    }
    for (const keyword of uniqueKeywords(args.keywords ?? [])) {
      if (args.action === "add") store.trackKeyword(keyword);
      else store.untrackKeyword(keyword);
    }
  }

  const keywords = store.trackedKeywords();
  const own = ownApps(ctx);
  return {
    apps: own.map(({ appId, title }) => ({ app_id: appId, title })),
    competitors: store.trackedApps().filter((app) => !app.isOwn).map(({ appId, title }) => ({ app_id: appId, title })),
    keywords: keywords.map((keyword) => ({
      keyword,
      latest_positions: own.map((app) => ({ app_id: app.appId, ...latestRank(store, app.appId, keyword) })),
    })),
    notes: ["Tracking is free. Run the rankings tool (or `open-aso track run` on a schedule) to record positions."],
    cost_usd: 0,
    cached: false,
    spend_today_usd: round4(store.spendTodayUsd()),
  };
}

// ---------- validate_metadata (free) ----------

export function validateMetadataTool(ctx: ToolContext, args: MetadataInput) {
  return { ...validateMetadata(args), cost_usd: 0, cached: false, spend_today_usd: round4(ctx.store.spendTodayUsd()) };
}

// ---------- helpers ----------

/** The user's apps: picked in setup (config) plus any tracked as own via the track tool. */
export function ownApps(ctx: ToolContext): Array<{ appId: string; title: string }> {
  const fromConfig = ctx.config.apps.map(({ appId, title }) => ({ appId, title }));
  const tracked = ctx.store.trackedApps().filter((app) => app.isOwn && !fromConfig.some((own) => own.appId === app.appId));
  return [...fromConfig, ...tracked.map(({ appId, title }) => ({ appId, title: title ?? `App ${appId}` }))];
}

/**
 * Runs a paid tool with a provider that tallies every call's cost, then adds
 * cost_usd / cached / spend_today_usd to the result.
 */
async function withCost<T extends object>(ctx: ToolContext, run: (provider: AsoDataProvider) => Promise<T>) {
  if (!ctx.provider) {
    throw new ToolError("DataForSEO isn't connected yet. Run `open-aso ui` and connect it in step 2 (new accounts get $1 of free credit).");
  }
  const inner = ctx.provider;
  let cost = 0;
  let calls = 0;
  let cachedCalls = 0;
  const track = async <R extends Billed<unknown>>(promise: Promise<R>): Promise<R> => {
    const result = await promise;
    cost += result.costUsd;
    calls += 1;
    if (result.cached) cachedCalls += 1;
    return result;
  };
  const tallied: AsoDataProvider = {
    searchApps: (...a) => track(inner.searchApps(...a)),
    getApp: (...a) => track(inner.getApp(...a)),
    getReviews: (...a) => track(inner.getReviews(...a)),
    keywordsForApp: (...a) => track(inner.keywordsForApp(...a)),
    appCompetitors: (...a) => track(inner.appCompetitors(...a)),
  };
  const result = await run(tallied);
  return {
    ...result,
    cost_usd: round4(cost),
    cached: calls > 0 && cachedCalls === calls,
    spend_today_usd: round4(ctx.store.spendTodayUsd()),
  };
}

function appBrief(app: Pick<AppSummary, "appId" | "title"> & Partial<AppSummary> & { position?: number }) {
  return {
    app_id: app.appId,
    title: app.title,
    ...(app.developer ? { developer: app.developer } : {}),
    ...(app.position !== undefined ? { position: app.position } : {}),
    ...(app.rating !== undefined ? { rating: Math.round(app.rating * 100) / 100 } : {}),
    ...(app.ratingCount !== undefined ? { rating_count: app.ratingCount } : {}),
  };
}

const LISTING_FIELDS: Array<keyof AppDetails> = ["title", "subtitle", "description", "version", "price", "iconUrl", "genre"];

function diffListing(before: AppDetails, after: AppDetails) {
  const changes: Array<{ field: string; before: unknown; after: unknown }> = [];
  for (const field of LISTING_FIELDS) {
    if (JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null)) {
      changes.push({ field, before: before[field] ?? null, after: after[field] ?? null });
    }
  }
  if (JSON.stringify(before.screenshots ?? []) !== JSON.stringify(after.screenshots ?? [])) {
    changes.push({ field: "screenshots", before: (before.screenshots ?? []).length, after: (after.screenshots ?? []).length });
  }
  return changes;
}

function latestRank(store: Store, appId: string, keyword: string) {
  const [latest] = store.rankHistory(appId, keyword, 1);
  return { position: latest?.position ?? null, checked_at: latest?.checkedAt ?? null };
}

function uniqueKeywords(keywords: string[]): string[] {
  return [...new Set(keywords.map((k) => k.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))];
}

function notesForKeywords(requested: number): string[] {
  return [
    "search_volume is DataForSEO's monthly US estimate, taken from the #1 ranking app's data. null = no data.",
    "difficulty (1-100) is based on the top 10 apps: rating volume, title targeting, ratings and giants.",
    ...(requested > MAX_KEYWORDS_PER_CALL ? [`Only the first ${MAX_KEYWORDS_PER_CALL} keywords were checked.`] : []),
  ];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
