import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DataForSeoClient } from "../src/data/dataforseo/client.js";
import { DataForSeoProvider, isCleanKeyword } from "../src/data/dataforseo/provider.js";

// Serves the real responses recorded by `npm run spike`.
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "dataforseo", `${name}.json`), "utf8"));

function fixtureClient(fixtures: Record<string, string>, requests: unknown[] = []) {
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (init?.body) requests.push(JSON.parse(String(init.body))[0]);
    if (path.endsWith("/task_post")) {
      return Response.json({ status_code: 20000, status_message: "Ok.", cost: 0.0024, tasks: [{ id: "t1", status_code: 20100, status_message: "Task Created.", cost: 0.0024, result: null }] });
    }
    const key = Object.keys(fixtures).find((prefix) => path.includes(prefix));
    if (!key) throw new Error(`No fixture for ${path}`);
    return Response.json(fixture(fixtures[key]!));
  }) as typeof fetch;
  return new DataForSeoClient({ apiKey: "dGVzdDp0ZXN0" }, { fetchImpl, pollIntervalMs: 1 });
}

describe("DataForSeoProvider (real fixtures)", () => {
  it("maps App Store search results", async () => {
    const provider = new DataForSeoProvider(fixtureClient({ app_searches: "app_searches_1" }));
    const { data, costUsd } = await provider.searchApps("messenger");
    expect(costUsd).toBe(0.0024);
    expect(data.results).toHaveLength(100);
    expect(data.results[0]).toMatchObject({ appId: "454638411", title: "Messenger", position: 1 });
    expect(data.results[0]!.ratingCount).toBeGreaterThan(1_000_000);
    expect(data.results.find((app) => app.appId === "686449807")?.position).toBe(6);
  });

  it("maps app listing details", async () => {
    const provider = new DataForSeoProvider(fixtureClient({ app_info: "app_info" }));
    const { data } = await provider.getApp("686449807");
    expect(data).toMatchObject({
      appId: "686449807",
      title: "Telegram Messenger",
      subtitle: "Fast. Secure. Powerful.",
      developer: "Telegram FZ-LLC",
      version: "12.9.4",
    });
    expect(data.description).toContain("instant messaging");
  });

  it("maps reviews", async () => {
    const provider = new DataForSeoProvider(fixtureClient({ app_reviews: "app_reviews" }));
    const { data } = await provider.getReviews("686449807");
    expect(data).toHaveLength(50);
    expect(data[0]).toMatchObject({ id: "13723631074", rating: 4, author: "Amirni021", version: "12.4" });
    expect(data[0]!.body.length).toBeGreaterThan(20);
  });

  it("maps Labs keywords, sorted by volume, and sends filters", async () => {
    const requests: any[] = [];
    const provider = new DataForSeoProvider(fixtureClient({ keywords_for_app: "labs_keywords_for_app" }, requests));
    const { data } = await provider.keywordsForApp("686449807", { maxPosition: 20, keywords: ["YouTube", "chat"] });
    expect(data[0]).toMatchObject({ keyword: "youtube", position: 19 });
    expect(data[0]!.searchVolume).toBeGreaterThan(1_000_000);
    expect(requests[0].order_by).toEqual(["keyword_data.keyword_info.search_volume,desc"]);
    expect(requests[0].filters).toEqual([
      ["ranked_serp_element.serp_item.rank_absolute", "<=", 20],
      "and",
      ["keyword_data.keyword", "in", ["youtube", "chat"]],
    ]);
  });

  it("maps competitors and excludes the app itself", async () => {
    const provider = new DataForSeoProvider(fixtureClient({ app_competitors: "labs_app_competitors" }));
    const { data } = await provider.appCompetitors("686449807", { limit: 5 });
    expect(data).toHaveLength(5);
    expect(data.some((c) => c.appId === "686449807")).toBe(false);
    expect(data[0]!.sharedKeywords).toBeGreaterThan(0);
  });

  it("filters malformed keywords", () => {
    expect(isCleanKeyword("instagram##")).toBe(false);
    expect(isCleanKeyword("chat app")).toBe(true);
    expect(isCleanKeyword("dr. who")).toBe(true);
  });
});
