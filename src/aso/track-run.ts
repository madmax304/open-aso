// The daily check behind `open-aso track run` and the UI's "Run check now":
// ranks for every tracked keyword (your apps and competitors) plus a listing
// snapshot per competitor to catch changes. Competitors share the same search
// results as your apps, so their ranks come from cache at no extra cost.

import { appTool, ownApps, rankingsTool, type ToolContext } from "../mcp/tools.js";

export interface TrackRunResult {
  keywords: number;
  apps: Array<{ appId: string; title: string; isOwn: boolean; rankings: Array<{ keyword: string; position: number | null; change: number | null }> }>;
  listingChanges: Array<{ appId: string; title: string; changes: Array<{ field: string }> }>;
  costUsd: number;
  errors: string[];
}

export async function runTrackCheck(ctx: ToolContext): Promise<TrackRunResult> {
  const keywords = ctx.store.trackedKeywords();
  const own = ownApps(ctx).map((app) => ({ ...app, isOwn: true }));
  const competitors = ctx.store.trackedApps().filter((app) => !app.isOwn).map((app) => ({ appId: app.appId, title: app.title ?? `App ${app.appId}`, isOwn: false }));
  const result: TrackRunResult = { keywords: keywords.length, apps: [], listingChanges: [], costUsd: 0, errors: [] };

  if (keywords.length) {
    for (const app of [...own, ...competitors]) {
      try {
        const ranks = await rankingsTool(ctx, { app: app.appId, keywords });
        result.costUsd += ranks.cost_usd;
        result.apps.push({
          ...app,
          rankings: ranks.rankings.map((row) => ({ keyword: row.keyword, position: row.position, change: row.change })),
        });
      } catch (error) {
        result.errors.push(`${app.title}: ${(error as Error).message}`);
      }
    }
  }

  for (const app of competitors) {
    try {
      const listing = await appTool(ctx, { app: app.appId });
      result.costUsd += listing.cost_usd;
      const changes = listing.changes_since_last_check?.changes ?? [];
      if (changes.length) result.listingChanges.push({ appId: app.appId, title: app.title, changes });
    } catch (error) {
      result.errors.push(`${app.title}: ${(error as Error).message}`);
    }
  }

  result.costUsd = Math.round(result.costUsd * 10_000) / 10_000;
  return result;
}
