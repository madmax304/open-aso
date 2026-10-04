// Builds the shared tool context from the user's config: storage, the metered
// DataForSEO provider (if connected) and the Apple app finder.

import { loadConfig } from "../core/config.js";
import { Store } from "../db/store.js";
import { findApps, lookupApp, lookupApps } from "../data/apple/search.js";
import { DataForSeoClient } from "../data/dataforseo/client.js";
import { DataForSeoProvider } from "../data/dataforseo/provider.js";
import { MeteredProvider } from "../data/metered.js";
import type { ToolContext } from "./tools.js";

export function createToolContext(source = "mcp"): ToolContext {
  const config = loadConfig();
  const store = new Store();
  const provider = config.dataforseo
    ? new MeteredProvider(new DataForSeoProvider(new DataForSeoClient({ apiKey: config.dataforseo.apiKey })), store, {
        dailySpendCapUsd: config.dailySpendCapUsd,
        source,
      })
    : null;
  return {
    store,
    config,
    provider,
    finder: {
      findApps: (query) => findApps(query, { limit: 5 }),
      lookupApp: (appId) => lookupApp(appId),
      lookupApps: (appIds) => lookupApps(appIds),
    },
  };
}
