// "Connect your agent": adds the open-aso MCP server to Claude Code, Claude
// Desktop and Cursor. Claude Code is configured through its own CLI; the others
// through their MCP config files, merged carefully with a backup.

import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const SERVER_NAME = "open-aso";

export type AgentId = "claude-code" | "claude-desktop" | "cursor";

export interface McpLaunch {
  command: string;
  args: string[];
}

export interface AgentStatus {
  id: AgentId;
  name: string;
  installed: boolean;
  connected: boolean;
  /** Shown after connecting, e.g. "Restart Claude Desktop to finish". */
  afterConnect?: string;
  /** Where the config lives, for users who want to check. */
  configPath?: string;
  /** Problem reading the existing config, if any. We never overwrite a file we can't parse. */
  problem?: string;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface AgentEnv {
  home: string;
  platform: NodeJS.Platform;
  appData?: string;
  launch: McpLaunch;
  run: (command: string, args: string[]) => Promise<RunResult>;
}

export function defaultAgentEnv(): AgentEnv {
  return {
    home: homedir(),
    platform: process.platform,
    appData: process.env.APPDATA,
    launch: mcpLaunch(),
    run: runCommand,
  };
}

/**
 * How agents should start the open-aso MCP server. From a source checkout we
 * point at the local code (the package isn't on npm yet); once installed from
 * npm, `npx -y open-aso mcp` works anywhere.
 */
export function mcpLaunch(): McpLaunch {
  const repoRoot = resolve(import.meta.dirname, "..", "..");
  const sourceCli = join(repoRoot, "src", "cli.ts");
  const tsx = join(repoRoot, "node_modules", ".bin", "tsx");
  if (import.meta.dirname.includes(`${join("src", "ui")}`) && existsSync(sourceCli) && existsSync(tsx)) {
    return { command: tsx, args: [sourceCli, "mcp"] };
  }
  return { command: "npx", args: ["-y", "open-aso", "mcp"] };
}

/** The generic MCP config snippet most clients accept. */
export function configSnippet(launch: McpLaunch): string {
  return JSON.stringify({ mcpServers: { [SERVER_NAME]: launch } }, null, 2);
}

const AGENTS: Array<{ id: AgentId; name: string }> = [
  { id: "claude-code", name: "Claude Code" },
  { id: "claude-desktop", name: "Claude Desktop" },
  { id: "cursor", name: "Cursor" },
];

export async function agentStatuses(env: AgentEnv): Promise<AgentStatus[]> {
  return Promise.all(AGENTS.map(({ id }) => agentStatus(id, env)));
}

export async function agentStatus(id: AgentId, env: AgentEnv): Promise<AgentStatus> {
  const name = AGENTS.find((agent) => agent.id === id)!.name;

  if (id === "claude-code") {
    const cli = claudeCommand(env);
    const version = await env.run(cli, ["--version"]).catch(() => null);
    if (!version || version.code !== 0) return { id, name, installed: false, connected: false };
    const existing = await env.run(cli, ["mcp", "get", SERVER_NAME]).catch(() => null);
    return {
      id, name, installed: true, connected: existing?.code === 0,
      afterConnect: "Start a new Claude Code session to use it.",
    };
  }

  const configPath = configFileFor(id, env);
  const installed = existsSync(dirname(configPath));
  const afterConnect = id === "claude-desktop"
    ? "Quit and reopen Claude Desktop to finish."
    : "Cursor picks it up automatically. If not, reload the window.";
  if (!installed) return { id, name, installed: false, connected: false, configPath };
  try {
    const config = readJsonConfig(configPath);
    return { id, name, installed, connected: Boolean(config.mcpServers?.[SERVER_NAME]), configPath, afterConnect };
  } catch (error) {
    return { id, name, installed, connected: false, configPath, afterConnect, problem: (error as Error).message };
  }
}

export async function connectAgent(id: AgentId, env: AgentEnv): Promise<AgentStatus> {
  if (id === "claude-code") {
    const cli = claudeCommand(env);
    // Re-adding fails if it already exists, so remove first (ignoring "not found").
    await env.run(cli, ["mcp", "remove", SERVER_NAME, "--scope", "user"]).catch(() => null);
    const result = await env.run(cli, [
      "mcp", "add", "--scope", "user", SERVER_NAME, "--", env.launch.command, ...env.launch.args,
    ]);
    if (result.code !== 0) throw new Error(`Claude Code couldn't add open-aso: ${(result.stderr || result.stdout).trim()}`);
    return agentStatus(id, env);
  }

  const configPath = configFileFor(id, env);
  if (!existsSync(dirname(configPath))) {
    throw new Error(`Couldn't find ${id === "cursor" ? "Cursor" : "Claude Desktop"} on this computer.`);
  }
  const config = readJsonConfig(configPath);
  config.mcpServers = { ...(config.mcpServers ?? {}), [SERVER_NAME]: env.launch };
  writeJsonConfig(configPath, config);
  return agentStatus(id, env);
}

export async function disconnectAgent(id: AgentId, env: AgentEnv): Promise<AgentStatus> {
  if (id === "claude-code") {
    const result = await env.run(claudeCommand(env), ["mcp", "remove", SERVER_NAME, "--scope", "user"]);
    if (result.code !== 0 && !/not found|no .*server/i.test(result.stderr + result.stdout)) {
      throw new Error(`Claude Code couldn't remove open-aso: ${(result.stderr || result.stdout).trim()}`);
    }
    return agentStatus(id, env);
  }

  const configPath = configFileFor(id, env);
  if (existsSync(configPath)) {
    const config = readJsonConfig(configPath);
    if (config.mcpServers?.[SERVER_NAME]) {
      delete config.mcpServers[SERVER_NAME];
      writeJsonConfig(configPath, config);
    }
  }
  return agentStatus(id, env);
}

export function isAgentId(value: string): value is AgentId {
  return AGENTS.some((agent) => agent.id === value);
}

function configFileFor(id: Exclude<AgentId, "claude-code">, env: AgentEnv): string {
  if (id === "cursor") return join(env.home, ".cursor", "mcp.json");
  if (env.platform === "darwin") return join(env.home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (env.platform === "win32") return join(env.appData ?? join(env.home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  return join(env.home, ".config", "Claude", "claude_desktop_config.json");
}

function claudeCommand(env: AgentEnv): string {
  return env.platform === "win32" ? "claude.cmd" : "claude";
}

interface McpConfigFile {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

function readJsonConfig(path: string): McpConfigFile {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as McpConfigFile;
  } catch {
    throw new Error(`${path} isn't valid JSON, so open-aso won't touch it. Fix it or add open-aso manually.`);
  }
}

/** Write a config file, keeping a one-time backup of the original. */
function writeJsonConfig(path: string, config: McpConfigFile): void {
  mkdirSync(dirname(path), { recursive: true });
  const backup = `${path}.before-open-aso`;
  if (existsSync(path) && !existsSync(backup)) copyFileSync(path, backup);
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
}

function runCommand(command: string, args: string[]): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, { timeout: 20_000, shell: process.platform === "win32" }, (error, stdout, stderr) => {
      if (error && (error as NodeJS.ErrnoException).code === "ENOENT") return reject(error);
      const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
      resolvePromise({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}
