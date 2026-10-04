// End-to-end: a real MCP client talks to the open-aso server over an in-memory
// transport, with a fake data provider and an in-memory database.

import { beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/mcp/server.js";
import type { ToolContext } from "../src/mcp/tools.js";
import { Store } from "../src/db/store.js";
import { MeteredProvider } from "../src/data/metered.js";
import type { AsoDataProvider } from "../src/data/provider.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { US_MARKET, type AppSummary } from "../src/core/types.js";

const natal: AppSummary = { appId: "111", title: "Natal - Pregnancy & Postpartum", developer: "Natal Inc" };
const rival: AppSummary = { appId: "222", title: "Ovia Pregnancy", developer: "Ovia Health" };

const serp = (keyword: string) => ({
  keyword, market: US_MARKET, checkedAt: "now",
  results: [
    { appId: "222", title: "Ovia Pregnancy", position: 1, ratingCount: 900_000, rating: 4.8 },
    { appId: "111", title: "Natal - Pregnancy & Postpartum", position: 4, ratingCount: 1200, rating: 4.6 },
  ],
});

const fakeData: AsoDataProvider = {
  searchApps: async (keyword) => ({ data: serp(keyword), costUsd: 0.0024, cached: false }),
  getApp: async (appId) => ({ data: { ...natal, appId, subtitle: "Track your pregnancy" }, costUsd: 0.0012, cached: false }),
  getReviews: async () => ({
    data: [
      { id: "1", rating: 5, body: "Love it" },
      { id: "2", rating: 2, body: "Crashes" },
    ],
    costUsd: 0.003,
    cached: false,
  }),
  keywordsForApp: async (appId, options) => {
    const all = appId === "222"
      ? [{ keyword: "pregnancy tracker", searchVolume: 50000, position: 1 }, { keyword: "baby names", searchVolume: 30000, position: 3 }]
      : [{ keyword: "pregnancy tracker", searchVolume: 50000, position: 4 }, { keyword: "postpartum", searchVolume: 8000, position: 2 }];
    const data = options?.keywords ? all.filter((k) => options.keywords!.includes(k.keyword)) : all;
    return { data, costUsd: 0.012, cached: false };
  },
  appCompetitors: async () => ({ data: [{ appId: "222", sharedKeywords: 120, avgPosition: 8.5 }], costUsd: 0.013, cached: false }),
};

let client: Client;
let store: Store;

async function connect(provider: AsoDataProvider | null) {
  store = new Store(":memory:");
  const ctx: ToolContext = {
    store,
    config: { ...DEFAULT_CONFIG, apps: [natal] },
    provider: provider && new MeteredProvider(provider, store, { dailySpendCapUsd: 1 }),
    finder: {
      findApps: async (query) => [natal, rival].filter((a) => a.title.toLowerCase().includes(query.toLowerCase())),
      lookupApp: async (id) => [natal, rival].find((a) => a.appId === id) ?? null,
      lookupApps: async (ids) => [natal, rival].filter((a) => ids.includes(a.appId)),
    },
  };
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createMcpServer(ctx).connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ text: string }>)[0]!.text;
  return { isError: Boolean(result.isError), text, json: result.isError ? null : JSON.parse(text) };
}

describe("MCP server", () => {
  beforeEach(() => connect(fakeData));

  it("lists the 7 tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["app", "competitors", "keywords", "rankings", "reviews", "track", "validate_metadata"]);
  });

  it("keywords mode 1: keywords for the user's own app by default", async () => {
    const { json } = await call("keywords", {});
    expect(json.app.title).toBe(natal.title);
    expect(json.keywords[0]).toEqual({ keyword: "pregnancy tracker", search_volume: 50000, position: 4 });
    expect(json.cost_usd).toBe(0.012);
    expect(json.spend_today_usd).toBe(0.012);
  });

  it("keywords mode 2: volume, difficulty and position for typed keywords", async () => {
    const { json } = await call("keywords", { keywords: ["Pregnancy Tracker"] });
    const [row] = json.keywords;
    expect(row).toMatchObject({ keyword: "pregnancy tracker", search_volume: 50000, your_position: 4 });
    expect(row.difficulty).toBeGreaterThan(0);
    expect(row.top_apps[0].title).toBe("Ovia Pregnancy");
  });

  it("keywords mode 2 with with_volume: false skips the volume lookup", async () => {
    const { json } = await call("keywords", { keywords: ["baby names"], with_volume: false });
    expect(json.keywords[0]).not.toHaveProperty("search_volume");
    expect(json.keywords[0].difficulty).toBeGreaterThan(0);
    expect(json.cost_usd).toBe(0.0024);
  });

  it("rankings saves history and reports change; repeat calls are cached and free", async () => {
    const first = await call("rankings", { keywords: ["pregnancy tracker"] });
    expect(first.json.rankings[0]).toMatchObject({ keyword: "pregnancy tracker", position: 4, previous_position: null });
    expect(store.rankHistory("111", "pregnancy tracker")).toHaveLength(1);

    const second = await call("rankings", { keywords: ["pregnancy tracker"] });
    expect(second.json.cached).toBe(true);
    expect(second.json.cost_usd).toBe(0);
  });

  it("app resolves by name and detects listing changes", async () => {
    const { json } = await call("app", { app: "Natal" });
    expect(json.app.subtitle).toBe("Track your pregnancy");
    expect(json.changes_since_last_check).toBeNull();
  });

  it("competitors lists named rivals, and computes a keyword gap", async () => {
    const list = await call("competitors", {});
    expect(list.json.competitors[0]).toMatchObject({ app_id: "222", title: "Ovia Pregnancy", shared_keywords: 120 });

    const gap = await call("competitors", { competitor: "Ovia" });
    expect(gap.json.keyword_gap.map((r: any) => r.keyword)).toEqual(["baby names"]);
    expect(gap.json.competitor_ahead.map((r: any) => r.keyword)).toEqual(["pregnancy tracker"]);
  });

  it("reviews include a rating summary", async () => {
    const { json } = await call("reviews", {});
    expect(json.summary).toMatchObject({ count: 2, average_rating: 3.5 });
  });

  it("track adds and lists keywords and competitors for free", async () => {
    const { json } = await call("track", { action: "add", keywords: ["Pregnancy Tracker"], competitors: ["Ovia"] });
    expect(json.keywords.map((k: any) => k.keyword)).toEqual(["pregnancy tracker"]);
    expect(json.competitors).toEqual([{ app_id: "222", title: "Ovia Pregnancy" }]);
    expect(json.cost_usd).toBe(0);

    const ranks = await call("rankings", {});
    expect(ranks.json.rankings.map((r: any) => r.keyword)).toEqual(["pregnancy tracker"]);
  });

  it("validate_metadata works offline", async () => {
    const { json } = await call("validate_metadata", { title: "A".repeat(31), keywords: "a, b" });
    expect(json.valid).toBe(false);
    expect(json.cost_usd).toBe(0);
  });
});

describe("MCP server without DataForSEO", () => {
  beforeEach(() => connect(null));

  it("paid tools explain how to connect; free tools still work", async () => {
    const paid = await call("keywords", {});
    expect(paid.isError).toBe(true);
    expect(paid.text).toMatch(/DataForSEO isn't connected/);

    const free = await call("validate_metadata", { title: "Natal" });
    expect(free.isError).toBe(false);
  });
});
