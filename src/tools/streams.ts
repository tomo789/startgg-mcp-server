import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { notFound } from "../startgg/errors.js";
import { normalizeStreamQueue } from "../startgg/normalize.js";
import * as s from "../schemas/common.js";
import { TTL, tournamentLocator, wrapHandler, type ToolContext } from "./shared.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

function describeLocator(vars: { id?: number; slug?: string }): string {
  return vars.id !== undefined ? `Tournament id ${vars.id}` : `Tournament "${vars.slug}"`;
}

export function registerStreamTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_stream_queue",
    {
      title: "Get stream queue",
      description:
        "Get a tournament's stream queue: each stream (source, channel name, derived URL for " +
        "Twitch) with the sets currently assigned to it. Returns empty queues when nothing " +
        "is queued. For the list of configured streams regardless of queue, use get_tournament.",
      inputSchema: { ...s.tournamentLocatorShape },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      const vars = tournamentLocator(args);
      // One request for every locator kind: the tournament node distinguishes
      // "tournament does not exist" (null tournament -> NOT_FOUND) from
      // "nothing is queued" (null streamQueue -> empty array).
      const data = await ctx.client.request<any>("GetStreamQueue", vars, {
        cacheTtlMs: TTL.streamQueue,
      });
      const t = data?.tournament;
      if (!t) throw notFound(describeLocator(vars));
      const queues = t.streamQueue;
      return {
        tournament: { id: t.id, name: t.name ?? null },
        // start.gg returns null (not []) when no sets are queued.
        streamQueues: Array.isArray(queues) ? queues.map(normalizeStreamQueue).filter(Boolean) : [],
      };
    }),
  );
}
