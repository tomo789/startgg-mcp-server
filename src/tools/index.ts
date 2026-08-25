import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./shared.js";
import { registerDiscoveryTools } from "./discovery.js";
import { registerTournamentTools } from "./tournaments.js";
import { registerEventTools } from "./events.js";
import { registerPlayerTools } from "./players.js";
import { registerStreamTools } from "./streams.js";
import { registerUtilityTools } from "./utility.js";

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  registerDiscoveryTools(server, ctx);
  registerTournamentTools(server, ctx);
  registerEventTools(server, ctx);
  registerPlayerTools(server, ctx);
  registerStreamTools(server, ctx);
  registerUtilityTools(server, ctx);
}
