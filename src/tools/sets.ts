import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { invalidInput, notFound } from "../startgg/errors.js";
import { normalizeSet } from "../startgg/normalize.js";
import * as s from "../schemas/common.js";
import { TTL, wrapHandler, type ToolContext } from "./shared.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function registerSetTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_set_games",
    {
      title: "Get set games",
      description:
        "Get one set's per-game details: stage, winner, per-game scores when reported, and the " +
        "characters each entrant played (also summarized as derivedCharacters). Character and " +
        "stage data only exists when the set was reported with it on start.gg: it is common for " +
        "late rounds and streamed sets and rare in early pools, so an empty games array means " +
        "not reported, not that no games were played. Typical flow: get_event_sets (e.g. " +
        "phaseIds for Top 8) -> pick set ids -> get_set_games. For many sets at once use " +
        "get_event_sets with includeGames: true.",
      inputSchema: {
        setId: z
          .union([s.positiveId, z.string().min(1).max(64)])
          .describe(
            "Set id from get_event_sets / get_player_sets (numeric, or the numeric string).",
          ),
      },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      const setId = args.setId;
      if (typeof setId === "string" && setId.startsWith("preview_")) {
        throw invalidInput(
          "Preview (unstarted) sets have no games yet; wait until the set starts and re-fetch it from get_event_sets.",
        );
      }
      const data = await ctx.client.request<any>(
        "GetSetGames",
        { id: setId },
        { cacheTtlMs: TTL.sets },
      );
      const raw = data?.set;
      if (raw == null) throw notFound(`Set ${setId}`);
      return { set: normalizeSet(raw) };
    }),
  );
}
