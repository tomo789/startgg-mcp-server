import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { StartggClient } from "./startgg/client.js";
import { RateLimiter } from "./startgg/rate-limit.js";
import { TtlCache } from "./startgg/cache.js";
import { registerAllTools } from "./tools/index.js";

export const SERVER_NAME = "startgg-mcp-server";
export const SERVER_VERSION = "0.1.0";

/**
 * Library module: builds the MCP server. Side-effect free on import — the
 * executable entry point lives in cli.ts.
 */
export function createServer(env: NodeJS.ProcessEnv = process.env): McpServer {
  const config = loadConfig(env, (m) => console.error(`[startgg-mcp-server] ${m}`));

  const client = new StartggClient({
    token: config.token,
    timeoutMs: config.timeoutMs,
    cacheEnabled: config.cacheEnabled,
    limiter: new RateLimiter({ maxRequests: config.rateLimitPerMinute, windowMs: 60_000 }),
    cache: new TtlCache(),
  });

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerAllTools(server, { client });

  // Note: stdout is reserved for the MCP protocol; all logging goes to stderr.
  if (!config.token) {
    console.error(
      "[startgg-mcp-server] STARTGG_TOKEN is not set. The server will start, but every " +
        "tool call will fail with AUTH_ERROR. Create a token at " +
        "https://start.gg/admin/profile/developer and set the STARTGG_TOKEN environment variable.",
    );
  }
  if (config.enableWrites) {
    console.error(
      "[startgg-mcp-server] STARTGG_ENABLE_WRITES=true, but this version implements no " +
        "write tools; the flag is reserved for future mutations.",
    );
  }

  return server;
}

/** Create the server and connect it over stdio. Used by the CLI entry point. */
export async function runServer(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const server = createServer(env);
  await server.connect(new StdioServerTransport());
  console.error(`[startgg-mcp-server] v${SERVER_VERSION} connected over stdio`);
}
