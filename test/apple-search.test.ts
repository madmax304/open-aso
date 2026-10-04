import { describe, expect, it } from "vitest";
import { findApps, parseAppStoreId } from "../src/data/apple/search.js";

const telegram = {
  trackId: 686449807,
  trackName: "Telegram Messenger",
  sellerName: "Telegram FZ-LLC",
  averageUserRating: 4.0,
  userRatingCount: 281986,
  artworkUrl100: "https://example.com/icon.png",
  trackViewUrl: "https://apps.apple.com/us/app/telegram-messenger/id686449807",
};

function fakeFetch(results: unknown[], record?: string[]): typeof fetch {
  return (async (url: string) => {
    record?.push(String(url));
    return new Response(JSON.stringify({ resultCount: results.length, results }));
  }) as typeof fetch;
}

describe("parseAppStoreId", () => {
  it("extracts the id from App Store links", () => {
    expect(parseAppStoreId("https://apps.apple.com/us/app/telegram-messenger/id686449807")).toBe("686449807");
    expect(parseAppStoreId("apps.apple.com/app/id686449807?mt=8")).toBe("686449807");
  });

  it("accepts a bare id", () => {
    expect(parseAppStoreId(" 686449807 ")).toBe("686449807");
  });

  it("returns null for app names", () => {
    expect(parseAppStoreId("telegram")).toBeNull();
    expect(parseAppStoreId("habit tracker 2")).toBeNull();
  });
});

describe("findApps", () => {
  it("searches by name and maps results", async () => {
    const urls: string[] = [];
    const [app] = await findApps("telegram", { fetchImpl: fakeFetch([telegram], urls) });
    expect(urls[0]).toContain("/search?");
    expect(urls[0]).toContain("entity=software");
    expect(app).toEqual({
      appId: "686449807",
      title: "Telegram Messenger",
      developer: "Telegram FZ-LLC",
      rating: 4.0,
      ratingCount: 281986,
      price: undefined,
      iconUrl: "https://example.com/icon.png",
      url: "https://apps.apple.com/us/app/telegram-messenger/id686449807",
    });
  });

  it("looks up an app directly when given a link", async () => {
    const urls: string[] = [];
    const apps = await findApps("https://apps.apple.com/us/app/x/id686449807", { fetchImpl: fakeFetch([telegram], urls) });
    expect(urls[0]).toContain("/lookup?id=686449807");
    expect(apps).toHaveLength(1);
  });

  it("returns nothing for an empty query without calling Apple", async () => {
    const urls: string[] = [];
    expect(await findApps("  ", { fetchImpl: fakeFetch([], urls) })).toEqual([]);
    expect(urls).toHaveLength(0);
  });
});
