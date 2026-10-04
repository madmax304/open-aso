#!/usr/bin/env node
// open-aso CLI entry point (also installed as `oaso`).
// Workstream B implements the remaining commands; this is the agreed command surface.

import { parseArgs } from "node:util";

// node:sqlite prints an ExperimentalWarning on every start; it's noise for users.
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const text = typeof warning === "string" ? warning : warning.message;
  if (text.includes("SQLite is an experimental feature")) return;
  return (emitWarning as (...args: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

const COMMANDS: Record<string, string> = {
  init: "Set up your app and your DataForSEO account",
  ui: "Open the local setup UI (--port <n>, --no-open)",
  mcp: "Start the MCP server (used by agent configs)",
  track: "Tracking: list | add | remove | run (daily rank check)",
  usage: "Show DataForSEO spend today and this month (--json)",
};

function printHelp(): void {
  console.log("open-aso: the open-source alternative to AppTweak and Sensor Tower\n");
  console.log("Usage: open-aso <command>\n");
  for (const [name, description] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(8)} ${description}`);
  }
}

async function runUi(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: { port: { type: "string" }, "no-open": { type: "boolean" } },
  });
  const { startUi } = await import("./ui/index.js");
  try {
    const { url } = await startUi({
      port: values.port ? Number(values.port) : undefined,
      open: !values["no-open"],
    });
    console.log(`open-aso setup is running at ${url}  (Ctrl+C to stop)`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      console.error("Port 4319 is in use. Is open-aso ui already running? Or try: open-aso ui --port 4320");
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

const [command, ...rest] = process.argv.slice(2);

if (!command || command === "help" || command === "--help" || command === "-h") {
  printHelp();
} else if (command === "ui") {
  await runUi(rest);
} else if (command === "mcp") {
  const { runMcp } = await import("./mcp/index.js");
  await runMcp();
} else if (command === "init") {
  const { runInit } = await import("./cli/commands.js");
  await runInit();
} else if (command === "track") {
  const { runTrack } = await import("./cli/commands.js");
  await runTrack(rest);
} else if (command === "usage") {
  const { runUsage } = await import("./cli/commands.js");
  runUsage(rest);
} else if (command === "--version" || command === "-v") {
  console.log("0.0.1");
} else {
  console.error(`Unknown command: ${command}\n`);
  printHelp();
  process.exitCode = 1;
}
