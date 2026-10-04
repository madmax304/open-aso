// CLI commands: init, track, usage. (ui and mcp live in src/cli.ts.)

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseArgs } from "node:util";
import { loadConfig, configPath } from "../core/config.js";
import { addOwnApp, emailFromKey, setDataForSeoKey } from "../core/setup.js";
import type { AppSummary } from "../core/types.js";
import { findApps } from "../data/apple/search.js";
import { getAccountBalance } from "../data/dataforseo/account.js";
import { DataForSeoClient, DataForSeoError } from "../data/dataforseo/client.js";
import { resolveDataForSeoCredentials } from "../data/dataforseo/credentials.js";
import { Store } from "../db/store.js";
import { createToolContext } from "../mcp/context.js";
import { trackTool } from "../mcp/tools.js";
import { runTrackCheck } from "../aso/track-run.js";
import { agentStatuses, connectAgent, defaultAgentEnv } from "../ui/agents.js";

// ---------- init ----------

export async function runInit(): Promise<void> {
  if (!stdin.isTTY) {
    console.error("open-aso init is interactive. Run it in a terminal, or use `open-aso ui` for the setup page.");
    process.exitCode = 1;
    return;
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log("\nopen-aso setup: three quick steps. (Prefer a browser? Run `open-aso ui`.)\n");

    // 1. Find your app
    console.log("Step 1 of 3: Find your app");
    const config = loadConfig();
    if (config.apps.length) {
      console.log(`  Already set up: ${config.apps.map((app) => app.title).join(", ")}`);
    }
    while (true) {
      const query = (await rl.question(config.apps.length ? "  Add another app (name or App Store link, Enter to skip): " : "  Your app's name or App Store link: ")).trim();
      if (!query) break;
      let apps: AppSummary[];
      try {
        apps = await findApps(query, { limit: 6 });
      } catch (error) {
        console.log(`  ${(error as Error).message}`);
        continue;
      }
      if (!apps.length) {
        console.log("  No apps found. Try the exact name, or paste the App Store link.");
        continue;
      }
      apps.forEach((app, index) => {
        const rating = app.rating ? ` ★${app.rating.toFixed(1)}` : "";
        console.log(`   ${index + 1}. ${app.title} · ${app.developer ?? "Unknown developer"}${rating}`);
      });
      const pick = (await rl.question("  Which one? (number, or Enter to search again): ")).trim();
      const chosen = apps[Number(pick) - 1];
      if (chosen) {
        addOwnApp(chosen);
        console.log(`  ✓ Added ${chosen.title}`);
        if (!(await yes(rl, "  Add another app? (y/N) "))) break;
      }
    }

    // 2. Connect DataForSEO
    console.log("\nStep 2 of 3: Connect DataForSEO (App Store data at cost price)");
    const existing = loadConfig().dataforseo;
    if (existing && !(await yes(rl, `  Already connected as ${emailFromKey(existing.apiKey) ?? "your account"}. Change it? (y/N) `))) {
      // keep
    } else {
      console.log("  1. Create an account at https://app.dataforseo.com/register (new accounts get $1 free)");
      console.log('  2. Open https://app.dataforseo.com/api-access and click "Send by email"');
      console.log("  3. Copy the two values from that email:\n");
      while (true) {
        const email = (await rl.question('  Email (DataForSEO calls this "API login"): ')).trim();
        const apiKey = (await askHidden(rl, '  API key (DataForSEO calls this "API password"): ')).trim();
        const resolved = resolveDataForSeoCredentials({ email, apiKey });
        if (!resolved.ok) {
          console.log(`  ${resolved.error}\n`);
          continue;
        }
        process.stdout.write("  Testing connection… ");
        try {
          const { balanceUsd } = await getAccountBalance(new DataForSeoClient({ apiKey: resolved.key }));
          setDataForSeoKey(resolved.key);
          console.log(`✓ Connected. Balance: ${balanceUsd === null ? "unknown" : `$${balanceUsd.toFixed(2)}`}`);
          break;
        } catch (error) {
          console.log(error instanceof DataForSeoError && error.statusCode === 401
            ? "✗ DataForSEO didn't accept that email and API key. Try again.\n"
            : `✗ Couldn't reach DataForSEO: ${(error as Error).message}\n`);
          if (!(await yes(rl, "  Try again? (Y/n) ", true))) break;
        }
      }
    }

    // 3. Connect your agent
    console.log("\nStep 3 of 3: Connect your AI agent");
    const env = defaultAgentEnv();
    const agents = await agentStatuses(env);
    for (const agent of agents) {
      if (!agent.installed) continue;
      if (agent.connected) {
        console.log(`  ✓ ${agent.name} is already connected`);
        continue;
      }
      if (await yes(rl, `  Connect ${agent.name}? (Y/n) `, true)) {
        try {
          const status = await connectAgent(agent.id, env);
          console.log(`  ✓ Added to ${status.name}. ${status.afterConnect ?? ""}`);
        } catch (error) {
          console.log(`  ✗ ${(error as Error).message}`);
        }
      }
    }
    if (!agents.some((agent) => agent.installed)) {
      console.log("  No supported agents found. Run `open-aso ui` for a config snippet for any MCP client.");
    }

    const appName = loadConfig().apps[0]?.title ?? "my app";
    console.log(`\nAll set. Settings are in ${configPath()}.`);
    console.log(`Try asking your agent: "Use open-aso to audit the App Store listing for ${appName}"\n`);
  } finally {
    rl.close();
  }
}

async function yes(rl: ReturnType<typeof createInterface>, question: string, defaultYes = false): Promise<boolean> {
  const answer = (await rl.question(question)).trim().toLowerCase();
  return answer ? answer.startsWith("y") : defaultYes;
}

/** Ask without echoing what's typed (for the API key). */
async function askHidden(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  const output = rl as unknown as { _writeToOutput?: (text: string) => void; output: NodeJS.WriteStream };
  const original = output._writeToOutput;
  let prompted = false;
  output._writeToOutput = (text: string) => {
    if (!prompted) {
      prompted = true;
      stdout.write(text);
    } else if (text.includes("\n")) {
      stdout.write("\n");
    } else {
      stdout.write("*".repeat(text.length));
    }
  };
  try {
    return await rl.question(question);
  } finally {
    output._writeToOutput = original;
  }
}

// ---------- track ----------

const TRACK_HELP = `Usage:
  open-aso track list
  open-aso track add "keyword one" "keyword two" [--competitor <name>]... [--app <name>]...
  open-aso track remove "keyword" [--competitor <name>]... [--app <name>]...
  open-aso track run        Check ranks for all tracked keywords (run daily, e.g. from cron)`;

export async function runTrack(args: string[]): Promise<void> {
  const [action, ...rest] = args;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: { competitor: { type: "string", multiple: true }, app: { type: "string", multiple: true }, json: { type: "boolean" } },
  });
  const ctx = createToolContext("track");
  try {
    if (action === "run") {
      if (!ctx.provider) {
        console.error("DataForSEO isn't connected yet. Run `open-aso init` or `open-aso ui` first.");
        process.exitCode = 1;
        return;
      }
      if (!ctx.config.apps.length && !ctx.store.trackedApps().length) {
        console.error("No apps set up yet. Run `open-aso init` or `open-aso ui` to add your app.");
        process.exitCode = 1;
        return;
      }
      const result = await runTrackCheck(ctx);
      if (values.json) return void console.log(JSON.stringify(result, null, 2));
      if (!result.keywords) {
        console.log('No tracked keywords yet. Add some: open-aso track add "pregnancy tracker"');
        return;
      }
      for (const app of result.apps) {
        console.log(`\n${app.title}${app.isOwn ? "" : " (competitor)"}`);
        for (const row of app.rankings) {
          const change = row.change ? (row.change > 0 ? ` ▲${row.change}` : ` ▼${-row.change}`) : "";
          console.log(`  ${row.keyword.padEnd(32)} ${row.position === null ? "not in top 100" : `#${row.position}`}${change}`);
        }
      }
      for (const change of result.listingChanges) {
        console.log(`\n${change.title} changed: ${change.changes.map((c) => c.field).join(", ")}`);
      }
      for (const error of result.errors) console.error(`\n✗ ${error}`);
      console.log(`\nCost: $${result.costUsd.toFixed(4)} · Spent today: $${ctx.store.spendTodayUsd().toFixed(4)}`);
      if (result.errors.length) process.exitCode = 1;
      return;
    }

    if (action === "list" || action === "add" || action === "remove") {
      const listing = await trackTool(ctx, {
        action,
        keywords: positionals,
        competitors: values.competitor,
        apps: values.app,
      });
      if (values.json) return void console.log(JSON.stringify(listing, null, 2));
      console.log(`Your apps:   ${listing.apps.map((app) => app.title).join(", ") || "(none)"}`);
      console.log(`Competitors: ${listing.competitors.map((app) => app.title).join(", ") || "(none)"}`);
      console.log(`Keywords:    ${listing.keywords.length ? "" : "(none)"}`);
      for (const keyword of listing.keywords) {
        const latest = keyword.latest_positions
          .map((p) => (p.position === null ? (p.checked_at ? "not in top 100" : "not checked yet") : `#${p.position}`))
          .join(", ");
        console.log(`  ${keyword.keyword.padEnd(32)} ${latest}`);
      }
      return;
    }

    console.log(TRACK_HELP);
    if (action) process.exitCode = 1;
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  } finally {
    ctx.store.close();
  }
}

// ---------- usage ----------

export function runUsage(args: string[]): void {
  const { values } = parseArgs({ args, options: { json: { type: "boolean" } } });
  const store = new Store();
  try {
    const config = loadConfig();
    const usage = {
      spend_today_usd: round4(store.spendTodayUsd()),
      spend_this_month_usd: round4(store.spendThisMonthUsd()),
      daily_cap_usd: config.dailySpendCapUsd,
      recent_calls: store.recentCalls(10),
    };
    if (values.json) return void console.log(JSON.stringify(usage, null, 2));
    console.log(`Today:      $${usage.spend_today_usd.toFixed(4)} of $${usage.daily_cap_usd.toFixed(2)} daily cap`);
    console.log(`This month: $${usage.spend_this_month_usd.toFixed(4)}`);
    if (usage.recent_calls.length) {
      console.log("\nRecent calls:");
      for (const call of usage.recent_calls) {
        console.log(`  ${call.calledAt}  ${call.endpoint.padEnd(16)} ${call.cached ? "cached" : `$${call.costUsd.toFixed(4)}`}  ${call.source ?? ""}`);
      }
    }
  } finally {
    store.close();
  }
}

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
