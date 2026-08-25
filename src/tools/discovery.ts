import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  normalizePageInfo,
  normalizeTournament,
  normalizeVideogame,
} from "../startgg/normalize.js";
import * as s from "../schemas/common.js";
import { TTL, toEpochSeconds, wrapHandler, type ToolContext } from "./shared.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SORT_BY = z
  .enum(["startAt asc", "startAt desc", "endAt asc", "endAt desc"])
  .optional()
  .describe("Sort order for tournaments.");

interface TournamentFilterArgs {
  name?: string;
  videogameId?: number;
  videogameIds?: number[];
  countryCode?: string;
  addrState?: string;
  upcoming?: boolean;
  past?: boolean;
  afterDate?: string | number;
  beforeDate?: string | number;
  regOpen?: boolean;
}

function buildTournamentFilter(args: TournamentFilterArgs): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (args.name !== undefined) filter.name = args.name;
  const ids = [
    ...(args.videogameId !== undefined ? [args.videogameId] : []),
    ...(args.videogameIds ?? []),
  ];
  if (ids.length > 0) filter.videogameIds = ids;
  if (args.countryCode !== undefined) filter.countryCode = args.countryCode.toUpperCase();
  if (args.addrState !== undefined) filter.addrState = args.addrState;
  if (args.upcoming !== undefined) filter.upcoming = args.upcoming;
  if (args.past !== undefined) filter.past = args.past;
  if (args.afterDate !== undefined) filter.afterDate = toEpochSeconds(args.afterDate, "afterDate");
  if (args.beforeDate !== undefined)
    filter.beforeDate = toEpochSeconds(args.beforeDate, "beforeDate");
  if (args.regOpen !== undefined) filter.regOpen = args.regOpen;
  return filter;
}

async function searchTournaments(
  ctx: ToolContext,
  vars: { page: number; perPage: number; sortBy?: string; filter: Record<string, unknown> },
) {
  const data = await ctx.client.request<any>("SearchTournaments", vars, {
    cacheTtlMs: TTL.search,
  });
  const conn = data?.tournaments;
  return {
    pageInfo: normalizePageInfo(conn?.pageInfo),
    tournaments: (conn?.nodes ?? []).map(normalizeTournament).filter(Boolean),
  };
}

export function registerDiscoveryTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "search_videogames",
    {
      title: "Search videogames",
      description:
        "Search start.gg's videogame catalog by name and get videogame ids. " +
        'Use this first to find the id for a game (e.g. "Super Smash Bros. Ultimate" -> 1386), ' +
        "then pass that id to tournament discovery tools.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .max(100)
          .describe('Game name to search for, e.g. "Street Fighter 6".'),
        page: s.page,
        perPage: s.perPage(100, 25),
      },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      const data = await ctx.client.request<any>(
        "SearchVideogames",
        { name: args.name, page: args.page ?? 1, perPage: args.perPage ?? 25 },
        { cacheTtlMs: TTL.videogames },
      );
      const conn = data?.videogames;
      return {
        pageInfo: normalizePageInfo(conn?.pageInfo),
        videogames: (conn?.nodes ?? []).map(normalizeVideogame).filter(Boolean),
      };
    }),
  );

  server.registerTool(
    "search_tournaments",
    {
      title: "Search tournaments",
      description:
        "Search start.gg tournaments with flexible filters: name, videogame ids, country/state, " +
        "date range (afterDate/beforeDate on start time), upcoming/past, open registration.",
      inputSchema: {
        name: z.string().min(1).max(200).optional().describe("Tournament name to search for."),
        videogameId: s.positiveId.optional().describe("Filter to one videogame id."),
        videogameIds: z
          .array(s.positiveId)
          .max(10)
          .optional()
          .describe("Filter to several videogame ids."),
        countryCode: s.countryCode.optional(),
        addrState: s.addrState.optional(),
        upcoming: z
          .boolean()
          .optional()
          .describe(
            "Only tournaments that have not ended yet (start.gg's filter also includes " +
              "tournaments currently in progress).",
          ),
        past: z.boolean().optional().describe("Only tournaments that already ended."),
        afterDate: s.dateArg.optional().describe("Only tournaments starting after this."),
        beforeDate: s.dateArg.optional().describe("Only tournaments starting before this."),
        regOpen: z.boolean().optional().describe("Only tournaments with open registration."),
        sortBy: SORT_BY,
        page: s.page,
        perPage: s.perPage(100, 25),
      },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) =>
      searchTournaments(ctx, {
        page: args.page ?? 1,
        perPage: args.perPage ?? 25,
        ...(args.sortBy ? { sortBy: args.sortBy } : {}),
        filter: buildTournamentFilter(args),
      }),
    ),
  );

  server.registerTool(
    "get_upcoming_tournaments",
    {
      title: "Get upcoming tournaments",
      description:
        "List tournaments that have not ended yet (including ones in progress), soonest first. " +
        "Filter by videogame id (get it from search_videogames), country/state, and a time " +
        "window in days.",
      inputSchema: {
        videogameId: s.positiveId
          .optional()
          .describe("Videogame id, e.g. 1386 for Smash Ultimate."),
        videogameIds: z.array(s.positiveId).max(10).optional(),
        countryCode: s.countryCode.optional(),
        addrState: s.addrState.optional(),
        withinDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe("Only tournaments starting within this many days from now. Default 30."),
        page: s.page,
        perPage: s.perPage(100, 25),
      },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      // Floor "now" to the minute: the computed beforeDate lands in the cache
      // key, and a per-second timestamp would defeat the 60s search cache.
      const nowSec = Math.floor(Date.now() / 60_000) * 60;
      const filter = buildTournamentFilter({ ...args, upcoming: true });
      filter.beforeDate = nowSec + (args.withinDays ?? 30) * 86400;
      return searchTournaments(ctx, {
        page: args.page ?? 1,
        perPage: args.perPage ?? 25,
        sortBy: "startAt asc",
        filter,
      });
    }),
  );

  server.registerTool(
    "get_tournaments_by_videogame",
    {
      title: "Get tournaments by videogame",
      description:
        "List tournaments for a specific videogame id. timeframe selects upcoming (default), " +
        "past, or all; combine with afterDate/beforeDate and location filters as needed.",
      inputSchema: {
        videogameId: s.positiveId.describe("Videogame id from search_videogames."),
        timeframe: z
          .enum(["upcoming", "past", "all"])
          .optional()
          .describe("Which tournaments to include. Default upcoming."),
        countryCode: s.countryCode.optional(),
        addrState: s.addrState.optional(),
        afterDate: s.dateArg.optional(),
        beforeDate: s.dateArg.optional(),
        page: s.page,
        perPage: s.perPage(100, 25),
      },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      const timeframe = args.timeframe ?? "upcoming";
      const filter = buildTournamentFilter({
        ...args,
        upcoming: timeframe === "upcoming" ? true : undefined,
        past: timeframe === "past" ? true : undefined,
      });
      return searchTournaments(ctx, {
        page: args.page ?? 1,
        perPage: args.perPage ?? 25,
        sortBy: timeframe === "past" ? "startAt desc" : "startAt asc",
        filter,
      });
    }),
  );
}
