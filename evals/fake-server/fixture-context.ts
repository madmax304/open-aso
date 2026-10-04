// A ToolContext for open-aso's real MCP tools, backed by the DataForSEO
// responses recorded in test/fixtures/dataforseo/ instead of the network.
//
// It plugs a fake `fetch` into the real DataForSeoClient, so the real
// provider, cost metering, difficulty scoring and tool code all run unchanged.
// Nothing here can reach DataForSEO: any request the fixtures can't answer
// throws. Storage is an in-memory SQLite database, so no files are written.
//
// The fixtures were recorded for Telegram Messenger (686449807), so that is
// the "user's own app" in every eval.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DataForSeoClient } from "../../src/data/dataforseo/client.js";
import { DataForSeoProvider } from "../../src/data/dataforseo/provider.js";
import { MeteredProvider } from "../../src/data/metered.js";
import { Store } from "../../src/db/store.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import type { AppSummary } from "../../src/core/types.js";
import type { ToolContext } from "../../src/mcp/tools.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "test", "fixtures", "dataforseo");

// Raw DataForSEO JSON; the real provider does the typed mapping.
type Json = any;
const fixture = (name: string): Json => JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));

export const OWN_APP_ID = "686449807"; // Telegram Messenger
/** The competitor in labs_app_intersection.json (Rakuten Viber Messenger). */
export const INTERSECTION_RIVAL_ID = "382617920";

const searches = { messenger: fixture("app_searches_1"), chat: fixture("app_searches_2") };
const appInfo = fixture("app_info");
const reviews = fixture("app_reviews");
const labsKeywords = fixture("labs_keywords_for_app");
const labsCompetitors = fixture("labs_app_competitors");
const labsIntersection = fixture("labs_app_intersection");

const firstResult = (envelope: Json) => envelope.tasks[0].result[0];

/** Every app seen in the fixtures, so the app finder works offline. */
function knownApps(): AppSummary[] {
  const byId = new Map<string, AppSummary>();
  for (const envelope of [searches.messenger, searches.chat]) {
    for (const item of firstResult(envelope).items) {
      if (!byId.has(item.app_id)) byId.set(item.app_id, { appId: item.app_id, title: item.title });
    }
  }
  const info = firstResult(appInfo).items[0];
  byId.set(OWN_APP_ID, { appId: OWN_APP_ID, title: info.title, developer: info.developer });
  const rival = firstResult(labsIntersection).items[0].intersection_result["2"];
  byId.set(INTERSECTION_RIVAL_ID, { appId: INTERSECTION_RIVAL_ID, title: rival.title });
  return [...byId.values()];
}

/** Recorded SERPs exist for "messenger" and "chat app"; other keywords reuse the closer one. */
function serpFor(keyword: string): Json {
  return /chat|text|talk|group|friend|social|room/i.test(keyword) ? searches.chat : searches.messenger;
}

/** Labs keyword items as they'd be returned for one app, using the intersection fixture for the rival. */
function labsItemsFor(appId: string): Json[] {
  if (appId === OWN_APP_ID) return firstResult(labsKeywords).items;
  return firstResult(labsIntersection).items.map((item: Json) => ({
    keyword_data: item.keyword_data,
    ranked_serp_element: { serp_item: item.intersection_result["2"] },
  }));
}

/** Search volume is per keyword, not per app, so a filtered lookup can use any fixture that knows it. */
function labsItemsByKeyword(keywords: string[]): Json[] {
  const all = [...labsItemsFor(OWN_APP_ID), ...labsItemsFor(INTERSECTION_RIVAL_ID)];
  const seen = new Set<string>();
  return all.filter((item) => {
    const keyword = item.keyword_data.keyword;
    if (!keywords.includes(keyword) || seen.has(keyword)) return false;
    seen.add(keyword);
    return true;
  });
}

const envelope = (cost: number, result: Json) => ({
  status_code: 20000, status_message: "Ok.", cost, tasks_count: 1, tasks_error: 0,
  tasks: [{ id: "fixture", status_code: 20000, status_message: "Ok.", cost, result: [result] }],
});

function fixtureFetch(): typeof fetch {
  const pending = new Map<string, { path: string; body: Json }>();
  let nextTask = 0;

  return (async (url: string | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const body = init?.body ? JSON.parse(String(init.body))[0] : undefined;

    if (path.endsWith("/task_post")) {
      const id = `fixture-${++nextTask}`;
      pending.set(id, { path, body });
      return Response.json({
        status_code: 20000, status_message: "Ok.", cost: 0.0024, tasks_count: 1, tasks_error: 0,
        tasks: [{ id, status_code: 20100, status_message: "Task Created.", cost: 0.0024, result: null }],
      });
    }

    const taskGet = path.match(/\/task_get\/advanced\/(.+)$/);
    if (taskGet) {
      const task = pending.get(taskGet[1]!);
      if (!task) throw new Error(`Fake DataForSEO: unknown task ${taskGet[1]}`);
      if (task.path.includes("/app_searches/")) return Response.json(serpFor(String(task.body.keyword)));
      if (task.path.includes("/app_info/")) {
        if (task.body.app_id !== OWN_APP_ID) return Response.json(envelope(0, { items: [] }));
        return Response.json(appInfo);
      }
      if (task.path.includes("/app_reviews/")) {
        if (task.body.app_id !== OWN_APP_ID) return Response.json(envelope(0, { items: [] }));
        return Response.json(reviews);
      }
    }

    if (path.endsWith("/keywords_for_app/live")) {
      const filters: Json[] = body.filters ?? [];
      const maxPosition = filters.find((f) => Array.isArray(f) && f[0] === "ranked_serp_element.serp_item.rank_absolute")?.[2];
      const keywordFilter: string[] | undefined = filters.find((f) => Array.isArray(f) && f[0] === "keyword_data.keyword")?.[2];
      let items = keywordFilter ? labsItemsByKeyword(keywordFilter) : labsItemsFor(String(body.app_id));
      if (maxPosition) items = items.filter((item) => (item.ranked_serp_element?.serp_item?.rank_absolute ?? Infinity) <= maxPosition);
      items = items
        .sort((a, b) => (b.keyword_data.keyword_info.search_volume ?? 0) - (a.keyword_data.keyword_info.search_volume ?? 0))
        .slice(0, body.limit ?? 50);
      return Response.json(envelope(labsKeywords.cost, { items }));
    }

    if (path.endsWith("/app_competitors/live")) {
      if (body.app_id !== OWN_APP_ID) return Response.json(envelope(labsCompetitors.cost, { items: [] }));
      return Response.json(labsCompetitors);
    }

    throw new Error(`Fake DataForSEO: no recorded response for ${path}`);
  }) as typeof fetch;
}

export function createFixtureContext(): ToolContext {
  const apps = knownApps();
  const own = apps.find((app) => app.appId === OWN_APP_ID)!;
  const store = new Store(":memory:");
  const client = new DataForSeoClient({ apiKey: "ZXZhbDpldmFs" }, { fetchImpl: fixtureFetch(), pollIntervalMs: 1 });
  return {
    store,
    config: { ...DEFAULT_CONFIG, apps: [own], dailySpendCapUsd: 1000 },
    // A high cap: recording dozens of keywords would otherwise trip the default $1 cap.
    provider: new MeteredProvider(new DataForSeoProvider(client), store, { dailySpendCapUsd: 1000, source: "eval" }),
    finder: {
      findApps: async (query) => apps.filter((app) => app.title.toLowerCase().includes(query.toLowerCase())).slice(0, 5),
      lookupApp: async (appId) => apps.find((app) => app.appId === appId) ?? null,
      lookupApps: async (appIds) => apps.filter((app) => appIds.includes(app.appId)),
    },
  };
}
