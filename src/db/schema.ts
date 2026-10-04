// open-aso local database (~/.open-aso/data.sqlite), opened with node:sqlite.
// Kept as a TS string so it ships inside dist/ with no copy step.

export const SCHEMA = `
-- Apps on the daily tracking list. is_own = 1 for the user's apps, 0 for competitors.
CREATE TABLE IF NOT EXISTS tracked_apps (
  app_id      TEXT PRIMARY KEY,
  title       TEXT,
  is_own      INTEGER NOT NULL DEFAULT 1,
  added_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Keywords on the daily tracking list.
CREATE TABLE IF NOT EXISTS tracked_keywords (
  keyword       TEXT NOT NULL,
  location_code INTEGER NOT NULL DEFAULT 2840,
  language_code TEXT NOT NULL DEFAULT 'en',
  added_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (keyword, location_code, language_code)
);

-- One row per (app, keyword) per check. position NULL = not in the fetched results.
CREATE TABLE IF NOT EXISTS rank_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id        TEXT NOT NULL,
  keyword       TEXT NOT NULL,
  location_code INTEGER NOT NULL DEFAULT 2840,
  position      INTEGER,
  checked_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rank_snapshots_lookup
  ON rank_snapshots (app_id, keyword, checked_at);

-- Listing snapshots, used to detect what changed between checks.
CREATE TABLE IF NOT EXISTS app_snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id      TEXT NOT NULL,
  data_json   TEXT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_app_snapshots_lookup ON app_snapshots (app_id, captured_at);

-- Every DataForSEO call, for the usage page and the daily spend cap.
CREATE TABLE IF NOT EXISTS api_calls (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint   TEXT NOT NULL,
  cost_usd   REAL NOT NULL,
  cached     INTEGER NOT NULL DEFAULT 0,
  source     TEXT,
  called_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_api_calls_called_at ON api_calls (called_at);

-- 24h response cache. key = method + normalized arguments.
CREATE TABLE IF NOT EXISTS cache (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`;
