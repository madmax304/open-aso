import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createToolContext } from "./context.js";
import { createMcpServer } from "./server.js";

export { createMcpServer } from "./server.js";
export { createToolContext } from "./context.js";

/** Start the MCP server on stdio. stdout carries the protocol, so log only to stderr. */
export async function runMcp(): Promise<void> {
  const ctx = createToolContext("mcp");
  const server = createMcpServer(ctx);
  await server.connect(new StdioServerTransport());
  const shutdown = () => {
    ctx.store.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
