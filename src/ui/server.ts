// Local setup UI: a tiny HTTP server bound to 127.0.0.1 that serves one page and
// a small JSON API over the config file. The UI configures; it never analyzes.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { AppSummary } from "../core/types.js";
import { databasePath, loadConfig, readConfigFile } from "../core/config.js";
import { addOwnApp, clearDataForSeoKey, emailFromKey, removeOwnApp, setDailySpendCap, setDataForSeoKey } from "../core/setup.js";
import { findApps } from "../data/apple/search.js";
import { createToolContext } from "../mcp/context.js";
import { ownApps, trackTool, type ToolContext } from "../mcp/tools.js";
import { runTrackCheck } from "../aso/track-run.js";
import { getAccountBalance } from "../data/dataforseo/account.js";
import { DataForSeoClient, DataForSeoError } from "../data/dataforseo/client.js";
import { resolveDataForSeoCredentials } from "../data/dataforseo/credentials.js";
import {
  type AgentEnv,
  agentStatuses,
  configSnippet,
  connectAgent,
  defaultAgentEnv,
  disconnectAgent,
  isAgentId,
} from "./agents.js";

export const LINKS = {
  github: "https://github.com/madmax304/open-aso",
  waitlist: "https://github.com/madmax304/open-aso/issues/1",
  dataforseoSignup: "https://app.dataforseo.com/register",
  dataforseoApiAccess: "https://app.dataforseo.com/api-access",
};

export interface UiDeps {
  findApps: (query: string) => Promise<AppSummary[]>;
  /** Validate credentials against DataForSEO and return the balance. */
  checkDataForSeo: (key: string) => Promise<{ balanceUsd: number | null }>;
  agentEnv: () => AgentEnv;
  /** Run something with the tool context (storage + data provider), cleaning up after. */
  withTools: <T>(fn: (ctx: ToolContext) => Promise<T>) => Promise<T>;
}

const defaultDeps: UiDeps = {
  findApps: (query) => findApps(query),
  checkDataForSeo: (key) => getAccountBalance(new DataForSeoClient({ apiKey: key })),
  agentEnv: defaultAgentEnv,
  withTools: async (fn) => {
    const ctx = createToolContext("ui");
    try {
      return await fn(ctx);
    } finally {
      ctx.store.close();
    }
  },
};

const PUBLIC_DIR = join(import.meta.dirname, "public");
const MAX_BODY_BYTES = 64 * 1024;

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function createUiServer(deps: UiDeps = defaultDeps): Server {
  const server = createServer(async (req, res) => {
    try {
      assertLocalRequest(req, server);
      await route(req, res, deps);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Unexpected error";
      sendJson(res, status, { error: message });
    }
  });
  return server;
}

async function route(req: IncomingMessage, res: ServerResponse, deps: UiDeps): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";

  if (method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(readFileSync(join(PUBLIC_DIR, "index.html")));
    return;
  }

  if (method === "GET" && url.pathname === "/api/state") {
    return sendJson(res, 200, currentState());
  }

  if (method === "GET" && url.pathname === "/api/apps/search") {
    const apps = await deps.findApps(url.searchParams.get("q") ?? "");
    return sendJson(res, 200, { apps });
  }

  if (method === "POST" && url.pathname === "/api/apps") {
    const { app } = await readJson<{ app?: AppSummary }>(req);
    if (!app?.appId || !app.title) throw new HttpError(400, "Pick an app from the search results.");
    addOwnApp(app);
    return sendJson(res, 200, currentState());
  }

  const appMatch = url.pathname.match(/^\/api\/apps\/(\d+)$/);
  if (method === "DELETE" && appMatch) {
    removeOwnApp(appMatch[1]!);
    return sendJson(res, 200, currentState());
  }

  if (method === "POST" && url.pathname === "/api/dataforseo") {
    const fields = await readJson<{ email?: string; apiKey?: string; base64?: string }>(req);
    const resolved = resolveDataForSeoCredentials(fields);
    if (!resolved.ok) throw new HttpError(400, resolved.error);
    const { balanceUsd } = await checkCredentials(deps, resolved.key);
    setDataForSeoKey(resolved.key);
    return sendJson(res, 200, { ...currentState(), balanceUsd });
  }

  if (method === "PUT" && url.pathname === "/api/settings") {
    const { dailySpendCapUsd } = await readJson<{ dailySpendCapUsd?: number }>(req);
    try {
      setDailySpendCap(Number(dailySpendCapUsd));
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
    return sendJson(res, 200, currentState());
  }

  if (method === "GET" && url.pathname === "/api/usage") {
    return sendJson(res, 200, await deps.withTools(async (ctx) => ({
      spendTodayUsd: ctx.store.spendTodayUsd(),
      spendThisMonthUsd: ctx.store.spendThisMonthUsd(),
      dailySpendCapUsd: loadConfig().dailySpendCapUsd,
      recentCalls: ctx.store.recentCalls(25),
    })));
  }

  if (method === "GET" && url.pathname === "/api/tracking") {
    return sendJson(res, 200, await deps.withTools((ctx) => trackingState(ctx)));
  }

  if (method === "POST" && url.pathname === "/api/tracking") {
    const body = await readJson<{ action?: string; keywords?: string[]; competitors?: string[] }>(req);
    if (body.action !== "add" && body.action !== "remove") throw new HttpError(400, "action must be add or remove");
    const action = body.action;
    return sendJson(res, 200, await deps.withTools(async (ctx) => {
      try {
        await trackTool(ctx, { action, keywords: body.keywords, competitors: body.competitors });
      } catch (error) {
        throw new HttpError(400, (error as Error).message);
      }
      return trackingState(ctx);
    }));
  }

  if (method === "GET" && url.pathname === "/api/tracking/history") {
    const appId = url.searchParams.get("app") ?? "";
    const keyword = url.searchParams.get("keyword") ?? "";
    return sendJson(res, 200, await deps.withTools(async (ctx) => ({ history: ctx.store.rankHistory(appId, keyword, 90) })));
  }

  if (method === "POST" && url.pathname === "/api/tracking/run") {
    return sendJson(res, 200, await deps.withTools(async (ctx) => {
      if (!ctx.provider) throw new HttpError(400, "Connect DataForSEO first (Home, step 2).");
      const result = await runTrackCheck(ctx);
      return { result, ...(await trackingState(ctx)) };
    }));
  }

  if (method === "GET" && url.pathname === "/api/export/ranks.csv") {
    const csv = await deps.withTools(async (ctx) => ranksCsv(ctx));
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="open-aso-ranks.csv"',
      "Cache-Control": "no-store",
    });
    res.end(csv);
    return;
  }

  if (method === "GET" && url.pathname === "/api/export/data.sqlite") {
    const path = databasePath();
    if (!existsSync(path)) throw new HttpError(404, "No data yet.");
    res.writeHead(200, {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": 'attachment; filename="open-aso-data.sqlite"',
      "Cache-Control": "no-store",
    });
    res.end(readFileSync(path));
    return;
  }

  if (method === "GET" && url.pathname === "/api/dataforseo/balance") {
    const key = loadConfig().dataforseo?.apiKey;
    if (!key) throw new HttpError(400, "DataForSEO isn't connected yet.");
    return sendJson(res, 200, await checkCredentials(deps, key));
  }

  if (method === "DELETE" && url.pathname === "/api/dataforseo") {
    clearDataForSeoKey();
    return sendJson(res, 200, currentState());
  }

  if (method === "GET" && url.pathname === "/api/agents") {
    const env = deps.agentEnv();
    return sendJson(res, 200, {
      agents: await agentStatuses(env),
      launch: env.launch,
      snippet: configSnippet(env.launch),
    });
  }

  const agentMatch = url.pathname.match(/^\/api\/agents\/([a-z-]+)\/(connect|disconnect)$/);
  if (method === "POST" && agentMatch) {
    const [, id, action] = agentMatch;
    if (!id || !isAgentId(id)) throw new HttpError(404, "Unknown agent");
    const env = deps.agentEnv();
    try {
      const agent = action === "connect" ? await connectAgent(id, env) : await disconnectAgent(id, env);
      return sendJson(res, 200, { agent });
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
  }

  throw new HttpError(404, "Not found");
}

/** What the page needs to render. Never includes credentials. */
function currentState() {
  const fileConfig = readConfigFile();
  const effective = loadConfig();
  const key = effective.dataforseo?.apiKey;
  return {
    apps: fileConfig.apps,
    dataforseo: key
      ? { connected: true, email: emailFromKey(key), source: fileConfig.dataforseo ? "config" : "environment" }
      : { connected: false },
    dailySpendCapUsd: effective.dailySpendCapUsd,
    links: LINKS,
  };
}

async function checkCredentials(deps: UiDeps, key: string) {
  try {
    return await deps.checkDataForSeo(key);
  } catch (error) {
    if (error instanceof DataForSeoError && error.statusCode === 401) {
      throw new HttpError(400, "DataForSEO didn't accept that email and API key. Double-check both, then try again.");
    }
    throw new HttpError(502, `Couldn't reach DataForSEO: ${(error as Error).message}`);
  }
}

/** Everything the Tracking page shows: apps, competitors, keywords with latest rank and change. Free. */
async function trackingState(ctx: ToolContext) {
  const own = ownApps(ctx);
  const competitors = ctx.store.trackedApps().filter((app) => !app.isOwn);
  const keywords = ctx.store.trackedKeywords().map((keyword) => ({
    keyword,
    ranks: [...own, ...competitors].map((app) => {
      const [latest, previous] = ctx.store.rankHistory(app.appId, keyword, 2);
      const change = latest?.position != null && previous?.position != null ? previous.position - latest.position : null;
      return { appId: app.appId, position: latest?.position ?? null, checkedAt: latest?.checkedAt ?? null, change };
    }),
  }));
  return {
    apps: own,
    competitors: competitors.map(({ appId, title }) => ({ appId, title: title ?? `App ${appId}` })),
    keywords,
    lastCheckedAt: keywords.flatMap((k) => k.ranks.map((r) => r.checkedAt)).filter(Boolean).sort().at(-1) ?? null,
  };
}

function ranksCsv(ctx: ToolContext): string {
  const titles = new Map<string, string>([
    ...ownApps(ctx).map((app) => [app.appId, app.title] as [string, string]),
    ...ctx.store.trackedApps().map((app) => [app.appId, app.title ?? ""] as [string, string]),
  ]);
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = ctx.store.allRanks().map((row) =>
    [row.checkedAt, row.appId, titles.get(row.appId) ?? "", row.keyword, row.position].map(escape).join(","),
  );
  return ["checked_at_utc,app_id,app_title,keyword,position", ...rows].join("\n") + "\n";
}

/**
 * Only serve requests addressed to this server on localhost. Blocks DNS
 * rebinding (bad Host) and cross-site writes from other pages (bad Origin).
 */
function assertLocalRequest(req: IncomingMessage, server: Server): void {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowedHosts.includes(req.headers.host ?? "")) throw new HttpError(403, "Forbidden host");
  const origin = req.headers.origin;
  if (req.method !== "GET" && origin && !allowedHosts.some((host) => origin === `http://${host}`)) {
    throw new HttpError(403, "Forbidden origin");
  }
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Request too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

export interface StartUiOptions {
  port?: number;
  open?: boolean;
}

export async function startUi(options: StartUiOptions = {}): Promise<{ url: string; server: Server }> {
  const server = createUiServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 4319, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  const url = `http://127.0.0.1:${port}`;
  if (options.open !== false) openBrowser(url);
  return { url, server };
}

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(command, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}
