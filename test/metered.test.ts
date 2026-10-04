import { describe, expect, it } from "vitest";
import { Store } from "../src/db/store.js";
import { MeteredProvider, SpendCapError } from "../src/data/metered.js";
import type { AsoDataProvider } from "../src/data/provider.js";
import { US_MARKET } from "../src/core/types.js";

function fakeProvider(costUsd = 0.01) {
  let calls = 0;
  const provider = {
    searchApps: async (keyword: string) => {
      calls += 1;
      return { data: { keyword, market: US_MARKET, checkedAt: "now", results: [] }, costUsd, cached: false };
    },
  } as unknown as AsoDataProvider;
  return { provider, calls: () => calls };
}

describe("MeteredProvider", () => {
  it("caches identical requests and logs costs", async () => {
    const store = new Store(":memory:");
    const fake = fakeProvider(0.01);
    const metered = new MeteredProvider(fake.provider, store, { dailySpendCapUsd: 1 });

    const first = await metered.searchApps("habit tracker");
    const second = await metered.searchApps("habit tracker");
    expect(first).toMatchObject({ costUsd: 0.01, cached: false });
    expect(second).toMatchObject({ costUsd: 0, cached: true });
    expect(fake.calls()).toBe(1);
    expect(store.spendTodayUsd()).toBeCloseTo(0.01);

    await metered.searchApps("other keyword");
    expect(fake.calls()).toBe(2);
    expect(store.spendTodayUsd()).toBeCloseTo(0.02);
  });

  it("refuses paid calls once the daily cap is reached, but still serves cache", async () => {
    const store = new Store(":memory:");
    const fake = fakeProvider(0.6);
    const metered = new MeteredProvider(fake.provider, store, { dailySpendCapUsd: 1 });

    await metered.searchApps("a");
    await metered.searchApps("b");
    await expect(metered.searchApps("c")).rejects.toBeInstanceOf(SpendCapError);
    expect(fake.calls()).toBe(2);
    expect((await metered.searchApps("a")).cached).toBe(true);
  });
});
