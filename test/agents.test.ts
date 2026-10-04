import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentEnv, agentStatuses, connectAgent, disconnectAgent } from "../src/ui/agents.js";

const launch = { command: "npx", args: ["-y", "open-aso", "mcp"] };

let home: string;
let calls: string[][];
let claudeServers: Set<string>;
let claudeInstalled: boolean;

function env(): AgentEnv {
  return {
    home,
    platform: "darwin",
    launch,
    // A fake `claude` CLI that remembers which MCP servers were added.
    run: async (command, args) => {
      calls.push([command, ...args]);
      if (!claudeInstalled) throw Object.assign(new Error("not found"), { code: "ENOENT" });
      const [sub, action, ...rest] = args;
      if (sub === "--version") return { code: 0, stdout: "2.0.0", stderr: "" };
      if (sub === "mcp" && action === "get") return { code: claudeServers.has(rest[0]!) ? 0 : 1, stdout: "", stderr: "" };
      if (sub === "mcp" && action === "add") { claudeServers.add("open-aso"); return { code: 0, stdout: "", stderr: "" }; }
      if (sub === "mcp" && action === "remove") {
        const existed = claudeServers.delete("open-aso");
        return { code: existed ? 0 : 1, stdout: "", stderr: existed ? "" : "No MCP server found" };
      }
      return { code: 1, stdout: "", stderr: "unknown" };
    },
  };
}

const desktopConfig = () => join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
const cursorConfig = () => join(home, ".cursor", "mcp.json");

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "open-aso-agents-"));
  calls = [];
  claudeServers = new Set();
  claudeInstalled = true;
  return () => rmSync(home, { recursive: true, force: true });
});

describe("agent detection", () => {
  it("reports agents that aren't installed", async () => {
    claudeInstalled = false;
    const statuses = await agentStatuses(env());
    expect(statuses.map((s) => [s.id, s.installed, s.connected])).toEqual([
      ["claude-code", false, false],
      ["claude-desktop", false, false],
      ["cursor", false, false],
    ]);
  });
});

describe("Claude Code", () => {
  it("connects via `claude mcp add` at user scope and disconnects", async () => {
    let status = await connectAgent("claude-code", env());
    expect(status.connected).toBe(true);
    expect(calls).toContainEqual(["claude", "mcp", "add", "--scope", "user", "open-aso", "--", "npx", "-y", "open-aso", "mcp"]);

    status = await disconnectAgent("claude-code", env());
    expect(status.connected).toBe(false);
  });
});

describe("Claude Desktop", () => {
  it("adds open-aso without touching other servers or settings, and keeps a backup", async () => {
    mkdirSync(join(home, "Library", "Application Support", "Claude"), { recursive: true });
    const original = { mcpServers: { other: { command: "other-server" } }, globalShortcut: "Cmd+Space" };
    writeFileSync(desktopConfig(), JSON.stringify(original));

    const status = await connectAgent("claude-desktop", env());
    expect(status.connected).toBe(true);
    const written = JSON.parse(readFileSync(desktopConfig(), "utf8"));
    expect(written.mcpServers.other).toEqual({ command: "other-server" });
    expect(written.mcpServers["open-aso"]).toEqual(launch);
    expect(written.globalShortcut).toBe("Cmd+Space");
    expect(JSON.parse(readFileSync(`${desktopConfig()}.before-open-aso`, "utf8"))).toEqual(original);

    await disconnectAgent("claude-desktop", env());
    const after = JSON.parse(readFileSync(desktopConfig(), "utf8"));
    expect(after.mcpServers).toEqual({ other: { command: "other-server" } });
  });

  it("refuses to touch a config file it can't parse", async () => {
    mkdirSync(join(home, "Library", "Application Support", "Claude"), { recursive: true });
    writeFileSync(desktopConfig(), "{ not json");
    const [, desktop] = await agentStatuses(env());
    expect(desktop!.problem).toMatch(/isn't valid JSON/);
    await expect(connectAgent("claude-desktop", env())).rejects.toThrow(/isn't valid JSON/);
    expect(readFileSync(desktopConfig(), "utf8")).toBe("{ not json");
  });

  it("won't create config for an app that isn't installed", async () => {
    await expect(connectAgent("claude-desktop", env())).rejects.toThrow(/Couldn't find/);
    expect(existsSync(desktopConfig())).toBe(false);
  });
});

describe("Cursor", () => {
  it("creates mcp.json when Cursor is installed but has no MCP config yet", async () => {
    mkdirSync(join(home, ".cursor"), { recursive: true });
    const status = await connectAgent("cursor", env());
    expect(status.connected).toBe(true);
    expect(JSON.parse(readFileSync(cursorConfig(), "utf8"))).toEqual({ mcpServers: { "open-aso": launch } });
  });
});
