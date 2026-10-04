// All reads and writes to the local SQLite database go through Store.
// Times are stored in UTC (SQLite datetime('now')); "today" means the UTC day.

import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { databasePath } from "../core/config.js";
import { SCHEMA } from "./schema.js";

// Loaded via require so bundlers/test runners that don't know node:sqlite yet leave it alone.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export interface TrackedApp {
  appId: string;
  title: string | null;
  isOwn: boolean;
}

export interface RankPoint {
  position: number | null;
  checkedAt: string;
}

export class Store {
  readonly db: DatabaseSyncType;

  constructor(path: string = databasePath()) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  // ---- Spend ----

  logCall(endpoint: string, costUsd: number, cached: boolean, source = "mcp"): void {
    this.db
      .prepare("INSERT INTO api_calls (endpoint, cost_usd, cached, source) VALUES (?, ?, ?, ?)")
      .run(endpoint, costUsd, cached ? 1 : 0, source);
  }

  spendTodayUsd(): number {
    const row = this.db
      .prepare("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM api_calls WHERE date(called_at) = date('now')")
      .get() as { total: number };
    return row.total;
  }

  spendThisMonthUsd(): number {
    const row = this.db
      .prepare("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM api_calls WHERE strftime('%Y-%m', called_at) = strftime('%Y-%m', 'now')")
      .get() as { total: number };
    return row.total;
  }

  // ---- Cache ----

  cacheGet<T>(key: string): T | undefined {
    const row = this.db
      .prepare("SELECT value_json FROM cache WHERE key = ? AND expires_at > datetime('now')")
      .get(key) as { value_json: string } | undefined;
    return row ? (JSON.parse(row.value_json) as T) : undefined;
  }

  cacheSet(key: string, value: unknown, ttlHours = 24): void {
    this.db
      .prepare("INSERT OR REPLACE INTO cache (key, value_json, expires_at) VALUES (?, ?, datetime('now', ?))")
      .run(key, JSON.stringify(value), `+${ttlHours} hours`);
  }

  // ---- Tracking list ----

  trackApp(appId: string, title: string | null, isOwn: boolean): void {
    this.db
      .prepare("INSERT INTO tracked_apps (app_id, title, is_own) VALUES (?, ?, ?) ON CONFLICT(app_id) DO UPDATE SET title = excluded.title, is_own = excluded.is_own")
      .run(appId, title, isOwn ? 1 : 0);
  }

  untrackApp(appId: string): void {
    this.db.prepare("DELETE FROM tracked_apps WHERE app_id = ?").run(appId);
  }

  trackedApps(): TrackedApp[] {
    const rows = this.db.prepare("SELECT app_id, title, is_own FROM tracked_apps ORDER BY is_own DESC, added_at").all() as Array<{
      app_id: string;
      title: string | null;
      is_own: number;
    }>;
    return rows.map((row) => ({ appId: row.app_id, title: row.title, isOwn: row.is_own === 1 }));
  }

  trackKeyword(keyword: string): void {
    this.db.prepare("INSERT OR IGNORE INTO tracked_keywords (keyword) VALUES (?)").run(normalizeKeyword(keyword));
  }

  untrackKeyword(keyword: string): void {
    this.db.prepare("DELETE FROM tracked_keywords WHERE keyword = ?").run(normalizeKeyword(keyword));
  }

  trackedKeywords(): string[] {
    const rows = this.db.prepare("SELECT keyword FROM tracked_keywords ORDER BY added_at").all() as Array<{ keyword: string }>;
    return rows.map((row) => row.keyword);
  }

  // ---- Rank history ----

  saveRank(appId: string, keyword: string, position: number | null): void {
    this.db
      .prepare("INSERT INTO rank_snapshots (app_id, keyword, position) VALUES (?, ?, ?)")
      .run(appId, normalizeKeyword(keyword), position);
  }

  rankHistory(appId: string, keyword: string, limit = 30): RankPoint[] {
    const rows = this.db
      .prepare("SELECT position, checked_at FROM rank_snapshots WHERE app_id = ? AND keyword = ? ORDER BY checked_at DESC, id DESC LIMIT ?")
      .all(appId, normalizeKeyword(keyword), limit) as Array<{ position: number | null; checked_at: string }>;
    return rows.map((row) => ({ position: row.position, checkedAt: row.checked_at }));
  }

  // ---- Listing snapshots ----

  saveAppSnapshot(appId: string, data: unknown): void {
    this.db.prepare("INSERT INTO app_snapshots (app_id, data_json) VALUES (?, ?)").run(appId, JSON.stringify(data));
  }

  latestAppSnapshot<T>(appId: string): { data: T; capturedAt: string } | undefined {
    const row = this.db
      .prepare("SELECT data_json, captured_at FROM app_snapshots WHERE app_id = ? ORDER BY captured_at DESC, id DESC LIMIT 1")
      .get(appId) as { data_json: string; captured_at: string } | undefined;
    return row ? { data: JSON.parse(row.data_json) as T, capturedAt: row.captured_at } : undefined;
  }
}

export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}
