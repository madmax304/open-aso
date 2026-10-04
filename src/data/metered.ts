// Wraps any AsoDataProvider with the guardrails every paid call needs:
// a 24h cache, cost logging to api_calls, and the daily spend cap.

import type { Billed } from "../core/types.js";
import type { Store } from "../db/store.js";
import type { AsoDataProvider } from "./provider.js";

export class SpendCapError extends Error {
  constructor(readonly spentUsd: number, readonly capUsd: number) {
    super(
      `Daily spend cap reached: $${spentUsd.toFixed(4)} of $${capUsd.toFixed(2)} spent today. ` +
        "Raise the cap in open-aso's settings (open-aso ui) or wait until tomorrow (UTC).",
    );
    this.name = "SpendCapError";
  }
}

export interface MeteredOptions {
  dailySpendCapUsd: number;
  /** Recorded in api_calls.source: 'mcp' | 'cli' | 'ui' | 'track'. */
  source?: string;
  cacheTtlHours?: number;
}

type Method = keyof AsoDataProvider;

export class MeteredProvider implements AsoDataProvider {
  constructor(
    private readonly inner: AsoDataProvider,
    private readonly store: Store,
    private readonly options: MeteredOptions,
  ) {}

  searchApps: AsoDataProvider["searchApps"] = (...args) => this.call("searchApps", args);
  getApp: AsoDataProvider["getApp"] = (...args) => this.call("getApp", args);
  getReviews: AsoDataProvider["getReviews"] = (...args) => this.call("getReviews", args);
  keywordsForApp: AsoDataProvider["keywordsForApp"] = (...args) => this.call("keywordsForApp", args);
  appCompetitors: AsoDataProvider["appCompetitors"] = (...args) => this.call("appCompetitors", args);

  private async call<M extends Method>(method: M, args: Parameters<AsoDataProvider[M]>): Promise<Awaited<ReturnType<AsoDataProvider[M]>>> {
    type Result = Awaited<ReturnType<AsoDataProvider[M]>>;
    const key = `${method}:${JSON.stringify(args)}`;
    const cached = this.store.cacheGet<Result["data"]>(key);
    if (cached !== undefined) {
      this.store.logCall(method, 0, true, this.options.source);
      return { data: cached, costUsd: 0, cached: true } as Result;
    }

    const spent = this.store.spendTodayUsd();
    if (spent >= this.options.dailySpendCapUsd) throw new SpendCapError(spent, this.options.dailySpendCapUsd);

    let result: Billed<unknown>;
    try {
      result = await (this.inner[method] as (...a: unknown[]) => Promise<Billed<unknown>>)(...args);
    } catch (error) {
      // DataForSEO may bill failed tasks; record whatever it charged.
      const charged = (error as { costUsd?: number }).costUsd;
      if (charged) this.store.logCall(method, charged, false, this.options.source);
      throw error;
    }
    this.store.logCall(method, result.costUsd, false, this.options.source);
    this.store.cacheSet(key, result.data, this.options.cacheTtlHours ?? 24);
    return result as Result;
  }
}
