// A fake open-aso MCP server for manual testing: the real 7 tools over stdio,
// answering from test/fixtures/dataforseo/ (no network, no credentials, no cost).
//
//   npx tsx evals/fake-server/server.ts
//
// `claude plugin eval` doesn't start this process (it substitutes the mocks in
// evals/mocks/open-aso/, which record-mocks.ts generates from the same
// context). Register it by hand to try the skills interactively:
//
//   claude mcp add open-aso-fake -- npx tsx evals/fake-server/server.ts

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "../../src/mcp/server.js";
import { createFixtureContext } from "./fixture-context.js";

const ctx = createFixtureContext();
await createMcpServer(ctx, "eval-fixtures").connect(new StdioServerTransport());
process.on("SIGINT", () => {
  ctx.store.close();
  process.exit(0);
});
