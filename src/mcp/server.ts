// open-aso MCP server: exposes the 7 tools to any MCP client over stdio.
// Descriptions are written for agents: what each tool does, and what it costs.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type ToolContext,
  appTool,
  competitorsTool,
  keywordsTool,
  rankingsTool,
  reviewsTool,
  trackTool,
  validateMetadataTool,
} from "./tools.js";

const APP_ARG = z
  .string()
  .optional()
  .describe("App name, App Store link or id. Omit for the user's own app.");

export function createMcpServer(ctx: ToolContext, version = "0.0.1"): McpServer {
  const server = new McpServer(
    { name: "open-aso", version },
    {
      instructions:
        "open-aso gives you US App Store data for App Store Optimization (ASO). " +
        "Paid tools use the user's DataForSEO credit (fractions of a cent per call) and report cost_usd; " +
        "track and validate_metadata are free. Identical requests within 24h are free (cached). " +
        "When writing App Store metadata, always run validate_metadata and fix every failed check before presenting it.",
    },
  );

  server.registerTool(
    "keywords",
    {
      title: "Keyword research",
      description:
        "Keyword research for the US App Store. Two modes: " +
        "(1) pass `app` to list keywords that app ranks for, with search volume and position (about $0.02; add with_difficulty for ~$0.025 more); " +
        "(2) pass `keywords` to check specific keywords: volume, difficulty (1-100), the user's position and the top apps (about $0.015 per keyword).",
      inputSchema: {
        app: APP_ARG,
        keywords: z.array(z.string()).max(25).optional().describe("Specific keywords to research (mode 2). Up to 25."),
        limit: z.number().int().min(1).max(200).optional().describe("Mode 1: how many keywords to return (default 30), highest volume first."),
        max_position: z.number().int().min(1).max(100).optional().describe("Mode 1: only keywords where the app ranks at or above this position."),
        with_difficulty: z.boolean().optional().describe("Mode 1: also score difficulty for the top 10 keywords."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) => respond(() => keywordsTool(ctx, args)),
  );

  server.registerTool(
    "rankings",
    {
      title: "Rank check",
      description:
        "Where an app ranks in US App Store search for each keyword (top 100), with change since the last check. " +
        "Saves results to history. Uses tracked keywords when `keywords` is omitted. About $0.0024 per keyword.",
      inputSchema: {
        app: APP_ARG,
        keywords: z.array(z.string()).max(25).optional().describe("Keywords to check. Defaults to the tracked keywords."),
        history: z.boolean().optional().describe("Include up to 30 past saved positions per keyword (free)."),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    (args) => respond(() => rankingsTool(ctx, args)),
  );

  server.registerTool(
    "app",
    {
      title: "App listing",
      description:
        "Full App Store listing for an app: title, subtitle, description, rating, version, screenshots. " +
        "Saves a snapshot and reports what changed since the last check, useful for watching competitors. About $0.0012.",
      inputSchema: { app: APP_ARG },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    (args) => respond(() => appTool(ctx, args)),
  );

  server.registerTool(
    "competitors",
    {
      title: "Competitors and keyword gap",
      description:
        "Without `competitor`: apps competing for the same keywords as the app (about $0.013). " +
        "With `competitor`: the keyword gap, meaning keywords the competitor ranks for that the app doesn't, or ranks lower on (about $0.03).",
      inputSchema: {
        app: APP_ARG,
        competitor: z.string().optional().describe("A competitor's name, link or id, to compare keywords against."),
        limit: z.number().int().min(1).max(25).optional().describe("How many competitors to list (default 10)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) => respond(() => competitorsTool(ctx, args)),
  );

  server.registerTool(
    "reviews",
    {
      title: "Recent reviews",
      description:
        "The most recent US App Store reviews for an app, with a rating summary. " +
        "Use them to find themes, complaints and feature requests. About $0.003 per 50 reviews.",
      inputSchema: {
        app: APP_ARG,
        limit: z.number().int().min(1).max(200).optional().describe("How many reviews (default 50)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) => respond(() => reviewsTool(ctx, args)),
  );

  server.registerTool(
    "track",
    {
      title: "Tracking list",
      description:
        "Add, remove or list the apps, competitors and keywords on the daily tracking list, with their latest saved positions. Free.",
      inputSchema: {
        action: z.enum(["add", "remove", "list"]),
        apps: z.array(z.string()).optional().describe("The user's own apps (name, link or id)."),
        competitors: z.array(z.string()).optional().describe("Competitor apps to track (name, link or id)."),
        keywords: z.array(z.string()).optional().describe("Keywords to track."),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    (args) => respond(() => trackTool(ctx, args)),
  );

  server.registerTool(
    "validate_metadata",
    {
      title: "Validate App Store metadata",
      description:
        "Checks a title (30 chars), subtitle (30) and keyword field (100) against Apple's limits and ASO best practice: " +
        "repeated words across fields, spaces after commas, plurals, filler words, unused space. Free and instant. " +
        "Run it on every metadata draft and fix all failed checks.",
      inputSchema: {
        title: z.string(),
        subtitle: z.string().optional(),
        keywords: z.string().optional().describe("The keyword field, comma-separated."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => respond(async () => validateMetadataTool(ctx, args)),
  );

  return server;
}

/** Turn a tool result or error into an MCP response. Errors are returned, not thrown, so agents can read them. */
async function respond(run: () => Promise<object>) {
  try {
    const result = await run();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { isError: true, content: [{ type: "text" as const, text: (error as Error).message }] };
  }
}
