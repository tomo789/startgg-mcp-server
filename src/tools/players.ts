import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { notFound } from "../startgg/errors.js";
import { normalizePageInfo, normalizePlayer, normalizeSet } from "../startgg/normalize.js";
import * as s from "../schemas/common.js";
import { TTL, wrapHandler, type ToolContext } from "./shared.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function registerPlayerTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_player",
    {
      title: "Get player",
      description:
        "Get a start.gg player by numeric player id: gamer tag, team prefix, and linked user. " +
        "Player ids appear in set/entrant results (players[].playerId).",
      inputSchema: {
        playerId: s.positiveId.describe("Numeric start.gg player id."),
      },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      const data = await ctx.client.request<any>(
        "GetPlayer",
        { id: args.playerId },
        { cacheTtlMs: TTL.player },
      );
      const p = data?.player;
      if (!p || p.id == null) throw notFound(`Player id ${args.playerId}`);
      return { player: normalizePlayer(p) };
    }),
  );

  server.registerTool(
    "get_player_sets",
    {
      title: "Get player sets",
      description:
        "Get a player's recent sets across tournaments (most recent first), in the same " +
        "normalized set form as get_event_sets, plus the event and tournament each set " +
        "belongs to. Filter by set state (e.g. COMPLETED).",
      inputSchema: {
        playerId: s.positiveId.describe("Numeric start.gg player id."),
        state: s.setStates.optional(),
        page: s.page,
        // Sets here carry extra event/tournament nesting; keep pages small to
        // stay under start.gg's 1000-objects-per-request complexity cap.
        perPage: s.perPage(20, 10),
      },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      const filters: Record<string, unknown> = {};
      if (args.state) filters.state = s.setStatesToInts(args.state);
      const data = await ctx.client.request<any>(
        "GetPlayerSets",
        {
          id: args.playerId,
          page: args.page ?? 1,
          perPage: args.perPage ?? 10,
          ...(Object.keys(filters).length > 0 ? { filters } : {}),
        },
        { cacheTtlMs: TTL.sets },
      );
      const p = data?.player;
      if (!p || p.id == null) throw notFound(`Player id ${args.playerId}`);
      return {
        player: { playerId: p.id, gamerTag: p.gamerTag ?? null, prefix: p.prefix ?? null },
        pageInfo: normalizePageInfo(p.sets?.pageInfo),
        sets: (p.sets?.nodes ?? []).map(normalizeSet).filter(Boolean),
      };
    }),
  );
}
