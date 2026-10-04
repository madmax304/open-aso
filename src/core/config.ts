import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveDataForSeoCredentials } from "../data/dataforseo/credentials.js";
import type { AppSummary } from "./types.js";

/** All local state lives here. Override with OPEN_ASO_HOME (used by tests). */
export function openAsoHome(): string {
  return process.env.OPEN_ASO_HOME ?? join(homedir(), ".open-aso");
}

export const configPath = () => join(openAsoHome(), "config.json");
export const databasePath = () => join(openAsoHome(), "data.sqlite");

export interface OpenAsoConfig {
  dataforseo?: {
    /**
     * Base64 of `email:apiKey`, which is what DataForSEO's API expects.
     * Users never see this; they enter their email and API key.
     */
    apiKey: string;
  };
  /** The user's own apps, as picked in setup (kept with name and icon for display). */
  apps: AppSummary[];
  /** Daily DataForSEO spend cap in USD. Tools refuse paid calls once reached. */
  dailySpendCapUsd: number;
}

export const DEFAULT_CONFIG: OpenAsoConfig = {
  apps: [],
  dailySpendCapUsd: 1,
};

/** The config file only, without environment overrides. Use this to edit and save. */
export function readConfigFile(): OpenAsoConfig {
  const path = configPath();
  const fromFile = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Partial<OpenAsoConfig>)
    : {};
  return { ...DEFAULT_CONFIG, ...fromFile };
}

/** The effective config: the file plus environment overrides. Use this to run. */
export function loadConfig(): OpenAsoConfig {
  const config = readConfigFile();

  // The environment overrides the file (handy for CI and the spike).
  const apiKey = dataForSeoKeyFromEnv();
  if (apiKey) config.dataforseo = { apiKey };

  return config;
}

/**
 * Reads DataForSEO credentials from the environment: either DATAFORSEO_EMAIL +
 * DATAFORSEO_API_KEY, or DATAFORSEO_BASE64 alone. Returns null when nothing is
 * set, and throws with a user-friendly message when the values are incomplete
 * or contradict each other.
 */
export function dataForSeoKeyFromEnv(): string | null {
  const fields = {
    email: process.env.DATAFORSEO_EMAIL,
    apiKey: process.env.DATAFORSEO_API_KEY,
    base64: process.env.DATAFORSEO_BASE64,
  };
  if (!Object.values(fields).some((value) => value?.trim())) return null;
  const resolved = resolveDataForSeoCredentials(fields);
  if (!resolved.ok) throw new Error(resolved.error);
  return resolved.key;
}

export function saveConfig(config: OpenAsoConfig): void {
  mkdirSync(openAsoHome(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + "\n");
  // The file holds API credentials: owner read/write only.
  chmodSync(configPath(), 0o600);
}
