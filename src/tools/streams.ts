import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { notFound } from "../startgg/errors.js";
import { normalizeStreamQueue } from "../startgg/normalize.js";
import * as s from "../schemas/common.js";
import { TTL, tournamentLocator, wrapHandler, type ToolContext } from "./shared.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

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
      let tournamentId = vars.id;
      let tournamentName: string | null = null;
      if (tournamentId === undefined) {
        const data = await ctx.client.request<any>(
          "ResolveTournament",
          { slug: vars.slug },
          { cacheTtlMs: TTL.resolve },
        );
        const t = data?.tournament;
        if (!t) throw notFound(`Tournament "${vars.slug}"`);
        tournamentId = t.id;
        tournamentName = t.name ?? null;
      }
      const data = await ctx.client.request<any>(
        "GetStreamQueue",
        { tournamentId },
        { cacheTtlMs: TTL.streamQueue },
      );
      const queues = data?.streamQueue;
      return {
        tournament: { id: tournamentId, name: tournamentName },
        // start.gg returns null (not []) when no sets are queued.
        streamQueues: Array.isArray(queues) ? queues.map(normalizeStreamQueue).filter(Boolean) : [],
      };
    }),
  );
}
