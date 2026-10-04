import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createUiServer } from "../src/ui/server.js";
import { encode } from "../src/data/dataforseo/credentials.js";
import { DataForSeoError } from "../src/data/dataforseo/client.js";
import { Store } from "../src/db/store.js";
import { DEFAULT_CONFIG, readConfigFile } from "../src/core/config.js";

const app = { appId: "686449807", title: "Telegram Messenger", developer: "Telegram FZ-LLC" };
const rival = { appId: "382617920", title: "Rakuten Viber Messenger" };
const goodKey = encode("dev@example.com", "good-key-123");

let home: string;
let server: Server;
let base: string;
let store: Store;

beforeAll(async () => {
  for (const name of ["DATAFORSEO_EMAIL", "DATAFORSEO_API_KEY", "DATAFORSEO_BASE64"]) delete process.env[name];
  server = createUiServer({
    findApps: async (query) => (query.includes("tele") ? [app] : []),
    checkDataForSeo: async (key) => {
      if (key !== goodKey) throw new DataForSeoError("Unauthorized", 401);
      return { balanceUsd: 45.29 };
    },
    agentEnv: () => ({
      home,
      platform: "darwin",
      launch: { command: "npx", args: ["-y", "open-aso", "mcp"] },
      run: async () => { throw Object.assign(new Error("not found"), { code: "ENOENT" }); },
    }),
    withTools: async (fn) => fn({
      store,
      config: { ...DEFAULT_CONFIG, apps: readConfigFile().apps },
      provider: null,
      finder: {
        findApps: async () => [rival],
        lookupApp: async (id) => (id === rival.appId ? rival : null),
        lookupApps: async () => [rival],
      },
    }),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(() => server.close());

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "open-aso-test-"));
  process.env.OPEN_ASO_HOME = home;
  store = new Store(":memory:");
  return () => {
    store.close();
    rmSync(home, { recursive: true, force: true });
  };
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("UI server", () => {
  it("serves the page", async () => {
    const res = await fetch(base + "/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Find your app");
  });

  it("starts with nothing set up", async () => {
    const state = await (await fetch(base + "/api/state")).json();
    expect(state.apps).toEqual([]);
    expect(state.dataforseo).toEqual({ connected: false });
  });

  it("searches, adds and removes apps", async () => {
    const { apps } = await (await fetch(base + "/api/apps/search?q=tele")).json();
    expect(apps).toEqual([app]);

    let state = await (await post("/api/apps", { app })).json();
    expect(state.apps).toEqual([app]);

    state = await (await post("/api/apps", { app })).json();
    expect(state.apps).toHaveLength(1);

    state = await (await fetch(base + `/api/apps/${app.appId}`, { method: "DELETE" })).json();
    expect(state.apps).toEqual([]);
  });

  it("connects DataForSEO with email + API key, never returning the key", async () => {
    const res = await post("/api/dataforseo", { email: "dev@example.com", apiKey: "good-key-123" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.dataforseo).toEqual({ connected: true, email: "dev@example.com", source: "config" });
    expect(body.balanceUsd).toBe(45.29);
    expect(JSON.stringify(body)).not.toContain("good-key-123");
    expect(JSON.stringify(body)).not.toContain(goodKey);

    const configFile = join(home, "config.json");
    expect(JSON.parse(readFileSync(configFile, "utf8")).dataforseo.apiKey).toBe(goodKey);
    // Windows has no POSIX permission bits: chmod only toggles read-only, so
    // stat reports 0o666 (438) whatever we set. Only check the mode elsewhere.
    if (process.platform !== "win32") expect(statSync(configFile).mode & 0o777).toBe(0o600);
  });

  it("explains rejected and incomplete credentials", async () => {
    const wrong = await post("/api/dataforseo", { email: "dev@example.com", apiKey: "wrong" });
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error).toMatch(/didn't accept/);

    const missing = await post("/api/dataforseo", { email: "dev@example.com" });
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toMatch(/Missing your API key/);
  });

  it("disconnects DataForSEO", async () => {
    await post("/api/dataforseo", { base64: goodKey });
    const state = await (await fetch(base + "/api/dataforseo", { method: "DELETE" })).json();
    expect(state.dataforseo.connected).toBe(false);
  });

  it("lists agents and connects Cursor", async () => {
    const { agents, snippet } = await (await fetch(base + "/api/agents")).json();
    expect(agents.map((agent: { id: string }) => agent.id)).toEqual(["claude-code", "claude-desktop", "cursor"]);
    expect(JSON.parse(snippet).mcpServers["open-aso"].args).toEqual(["-y", "open-aso", "mcp"]);

    mkdirSync(join(home, ".cursor"), { recursive: true });
    const res = await post("/api/agents/cursor/connect", {});
    expect((await res.json()).agent.connected).toBe(true);

    expect((await post("/api/agents/nope/connect", {})).status).toBe(404);
  });

  it("saves the daily spend cap and rejects silly values", async () => {
    const res = await fetch(base + "/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dailySpendCapUsd: 2.5 }) });
    expect((await res.json()).dailySpendCapUsd).toBe(2.5);
    const bad = await fetch(base + "/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dailySpendCapUsd: -1 }) });
    expect(bad.status).toBe(400);
  });

  it("reports usage", async () => {
    store.logCall("searchApps", 0.0024, false);
    const usage = await (await fetch(base + "/api/usage")).json();
    expect(usage.spendTodayUsd).toBeCloseTo(0.0024);
    expect(usage.recentCalls[0].endpoint).toBe("searchApps");
  });

  it("manages tracking, shows latest rank and change, and exports CSV", async () => {
    await post("/api/apps", { app });
    let tracking = await (await post("/api/tracking", { action: "add", keywords: ["Messenger"], competitors: ["382617920"] })).json();
    expect(tracking.keywords.map((k: any) => k.keyword)).toEqual(["messenger"]);
    expect(tracking.competitors).toEqual([rival]);

    store.saveRank(app.appId, "messenger", 9);
    store.db.exec("UPDATE rank_snapshots SET checked_at = datetime('now', '-1 day')");
    store.saveRank(app.appId, "messenger", 6);
    tracking = await (await fetch(base + "/api/tracking")).json();
    expect(tracking.keywords[0].ranks[0]).toMatchObject({ appId: app.appId, position: 6, change: 3 });

    const history = await (await fetch(base + `/api/tracking/history?app=${app.appId}&keyword=messenger`)).json();
    expect(history.history.map((h: any) => h.position)).toEqual([6, 9]);

    const csv = await (await fetch(base + "/api/export/ranks.csv")).text();
    expect(csv.split("\n")[0]).toBe("checked_at_utc,app_id,app_title,keyword,position");
    expect(csv).toContain(",686449807,Telegram Messenger,messenger,6");

    const run = await post("/api/tracking/run", {});
    expect(run.status).toBe(400);
    expect((await run.json()).error).toMatch(/Connect DataForSEO/);
  });

  it("rejects writes from other websites", async () => {
    const res = await post("/api/apps", { app }, { Origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });
});
