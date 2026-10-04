// Config changes shared by the setup UI, `open-aso init` and the MCP tools,
// so every entry point edits the config file the same way.

import type { AppSummary } from "./types.js";
import { readConfigFile, saveConfig } from "./config.js";

export function addOwnApp(app: AppSummary): void {
  const config = readConfigFile();
  if (config.apps.some((existing) => existing.appId === app.appId)) return;
  const { appId, title, developer, rating, ratingCount, iconUrl, url } = app;
  config.apps.push({ appId: String(appId), title: String(title), developer, rating, ratingCount, iconUrl, url });
  saveConfig(config);
}

export function removeOwnApp(appId: string): void {
  const config = readConfigFile();
  config.apps = config.apps.filter((app) => app.appId !== appId);
  saveConfig(config);
}

export function setDataForSeoKey(key: string): void {
  const config = readConfigFile();
  config.dataforseo = { apiKey: key };
  saveConfig(config);
}

export function clearDataForSeoKey(): void {
  const config = readConfigFile();
  delete config.dataforseo;
  saveConfig(config);
}

export function setDailySpendCap(usd: number): void {
  if (!Number.isFinite(usd) || usd < 0 || usd > 1000) throw new Error("The daily cap must be between $0 and $1,000.");
  const config = readConfigFile();
  config.dailySpendCapUsd = Math.round(usd * 100) / 100;
  saveConfig(config);
}

/** Decode the account email from the stored Base64 key, for display only. */
export function emailFromKey(key: string): string | undefined {
  const decoded = Buffer.from(key, "base64").toString("utf8");
  const email = decoded.slice(0, decoded.indexOf(":"));
  return email.includes("@") ? email : undefined;
}
