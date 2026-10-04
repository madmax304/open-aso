// Turn whatever an agent passes as "app" (a name, App Store link, id, or
// nothing for "my app") into a concrete app. Uses Apple's free search only.

import type { AppSummary } from "../core/types.js";
import { parseAppStoreId } from "../data/apple/search.js";

export interface AppFinder {
  findApps: (query: string) => Promise<AppSummary[]>;
  lookupApp: (appId: string) => Promise<AppSummary | null>;
}

export interface ResolvedApp {
  app: AppSummary;
  /** Other close matches when resolving by name, so the agent can double-check. */
  otherMatches?: Array<Pick<AppSummary, "appId" | "title" | "developer">>;
}

export async function resolveApp(input: string | undefined, ownApps: AppSummary[], finder: AppFinder): Promise<ResolvedApp> {
  const text = input?.trim() ?? "";

  if (!text || /^(my app|mine|me)$/i.test(text)) {
    const own = ownApps[0];
    if (!own) throw new Error("No app given, and no app is set up yet. Pass an app name, or add your app with `open-aso ui`.");
    return { app: own };
  }

  const id = parseAppStoreId(text);
  if (id) {
    const own = ownApps.find((app) => app.appId === id);
    if (own) return { app: own };
    const found = await finder.lookupApp(id).catch(() => null);
    return { app: found ?? { appId: id, title: `App ${id}` } };
  }

  const ownMatch = ownApps.find((app) => app.title.toLowerCase().includes(text.toLowerCase()));
  if (ownMatch) return { app: ownMatch };

  const matches = await finder.findApps(text);
  const [first, ...rest] = matches;
  if (!first) throw new Error(`No App Store app found for "${text}". Try the exact app name or its App Store link.`);
  const exact = matches.find((app) => app.title.toLowerCase() === text.toLowerCase());
  const chosen = exact ?? first;
  return {
    app: chosen,
    otherMatches: [first, ...rest].filter((app) => app.appId !== chosen.appId).slice(0, 3)
      .map(({ appId, title, developer }) => ({ appId, title, developer })),
  };
}
