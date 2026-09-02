import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { notFound } from "../startgg/errors.js";
import {
  normalizeEntrant,
  normalizeEventSummary,
  normalizePageInfo,
  normalizePhase,
  normalizeSet,
  normalizeStanding,
} from "../startgg/normalize.js";
import * as s from "../schemas/common.js";
import {
  FETCH_ALL_MAX_PAGES,
  TTL,
  eventLocator,
  fetchAllPages,
  wrapHandler,
  type ToolContext,
} from "./shared.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SORT_TYPE = z
  .enum(["NONE", "CALL_ORDER", "MAGIC", "RECENT", "STANDARD", "ROUND"])
  .optional()
  .describe("start.gg set sort order. RECENT = most recently completed first.");

function describeLocator(vars: { id?: number; slug?: string }): string {
  return vars.id !== undefined ? `Event id ${vars.id}` : `Event "${vars.slug}"`;
}

const FETCH_ALL = z
  .boolean()
  .optional()
  .describe(
    "Fetch several pages at once (up to a small safety cap; pageInfo.truncated=true means more pages exist and you should page manually). Ignores page/perPage.",
  );

export function registerEventTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_event",
    {
      title: "Get event",
      description:
        "Get one event (bracket) of a tournament: name, start time, state, entrant count, " +
        "videogame, parent tournament, and its phases (e.g. Pools, Top 8) with phase ids " +
        "you can pass to get_event_sets phaseIds.",
      inputSchema: { ...s.eventLocatorShape },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      const vars = eventLocator(args);
      const data = await ctx.client.request<any>("GetEvent", vars, {
        cacheTtlMs: TTL.eventMeta,
      });
      const e = data?.event;
      if (!e) throw notFound(describeLocator(vars));
      return {
        event: {
          ...normalizeEventSummary(e),
          tournament: e.tournament
            ? {
                id: e.tournament.id,
                name: e.tournament.name ?? null,
                slug: e.tournament.slug ?? null,
                timezone: e.tournament.timezone ?? null,
              }
            : null,
          phases: (e.phases ?? []).map(normalizePhase).filter(Boolean),
        },
      };
    }),
  );

  server.registerTool(
    "get_event_entrants",
    {
      title: "Get event entrants",
      description:
        "List an event's entrants with their seed (initialSeedNum), players (gamer tags), " +
        "and disqualification flag. Supports pagination or fetchAll.",
      inputSchema: {
        ...s.eventLocatorShape,
        name: z
          .string()
          .min(1)
          .max(100)
          .optional()
          .describe("Filter entrants by name/tag (contains match)."),
        page: s.page,
        perPage: s.perPage(100, 50),
        fetchAll: FETCH_ALL,
      },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      const vars = eventLocator(args);
      const baseVars = {
        ...vars,
        ...(args.name !== undefined ? { name: args.name } : {}),
      };
      const getPage = async (page: number, perPage: number) => {
        const data = await ctx.client.request<any>(
          "GetEventEntrants",
          { ...baseVars, page, perPage },
          { cacheTtlMs: TTL.entrants },
        );
        const e = data?.event;
        if (!e) throw notFound(describeLocator(vars));
        return e;
      };

      if (args.fetchAll) {
        const perPage = 100;
        const first = await getPage(1, perPage);
        const { nodes, pageInfo } = await fetchAllPages(
          async (page) => (page === 1 ? first : await getPage(page, perPage)).entrants,
          perPage,
          FETCH_ALL_MAX_PAGES.entrants,
        );
        return {
          event: { id: first.id, name: first.name ?? null, slug: first.slug ?? null },
          pageInfo,
          entrants: nodes.map(normalizeEntrant).filter(Boolean),
        };
      }

      const e = await getPage(args.page ?? 1, args.perPage ?? 50);
      return {
        event: { id: e.id, name: e.name ?? null, slug: e.slug ?? null },
        pageInfo: normalizePageInfo(e.entrants?.pageInfo),
        entrants: (e.entrants?.nodes ?? []).map(normalizeEntrant).filter(Boolean),
      };
    }),
  );

  server.registerTool(
    "get_event_standings",
    {
      title: "Get event standings",
      description:
        "Get an event's standings (final or current placements), best first. " +
        "Includes each entrant's seed so upsets are visible. Use perPage 8 for Top 8.",
      inputSchema: {
        ...s.eventLocatorShape,
        page: s.page,
        perPage: s.perPage(100, 25),
        fetchAll: FETCH_ALL,
      },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      const vars = eventLocator(args);
      const getPage = async (page: number, perPage: number) => {
        const data = await ctx.client.request<any>(
          "GetEventStandings",
          { ...vars, page, perPage },
          { cacheTtlMs: TTL.standings },
        );
        const e = data?.event;
        if (!e) throw notFound(describeLocator(vars));
        return e;
      };

      if (args.fetchAll) {
        const perPage = 100;
        const first = await getPage(1, perPage);
        const { nodes, pageInfo } = await fetchAllPages(
          async (page) => (page === 1 ? first : await getPage(page, perPage)).standings,
          perPage,
          FETCH_ALL_MAX_PAGES.standings,
        );
        return {
          event: { id: first.id, name: first.name ?? null, slug: first.slug ?? null },
          pageInfo,
          standings: nodes.map(normalizeStanding).filter(Boolean),
        };
      }

      const e = await getPage(args.page ?? 1, args.perPage ?? 25);
      return {
        event: { id: e.id, name: e.name ?? null, slug: e.slug ?? null },
        pageInfo: normalizePageInfo(e.standings?.pageInfo),
        standings: (e.standings?.nodes ?? []).map(normalizeStanding).filter(Boolean),
      };
    }),
  );

  server.registerTool(
    "get_event_sets",
    {
      title: "Get event sets",
      description:
        "List an event's sets (matches) in a normalized form: round, state " +
        "(COMPLETED/ACTIVE/...), both entrants with seeds and players, per-entrant score " +
        "(-1 = DQ), winner, phase, stream, and VOD URL when available. " +
        "Filter by state, phaseIds (from get_event's phases, e.g. Top 8), round, entrants, or players. " +
        "Set includeGames: true to also return each set's games (stage, winner, character selections) " +
        "and derivedCharacters; that forces perPage <= 10 because of start.gg's complexity cap.",
      inputSchema: {
        ...s.eventLocatorShape,
        state: s.setStates.optional(),
        phaseIds: z
          .array(s.positiveId)
          .max(20)
          .optional()
          .describe("Only sets in these phase ids (get_event lists phases)."),
        roundNumber: z
          .number()
          .int()
          .optional()
          .describe("Only sets with this numeric round (negative = losers bracket)."),
        entrantIds: z
          .array(s.positiveId)
          .max(20)
          .optional()
          .describe("Only sets involving these entrant ids."),
        playerIds: z
          .array(s.positiveId)
          .max(20)
          .optional()
          .describe("Only sets involving these player ids (players[].playerId in set results)."),
        showByes: z.boolean().optional().describe("Include bye sets. Default false."),
        hasVod: z.boolean().optional().describe("Only sets that have a VOD."),
        sortType: SORT_TYPE,
        includeGames: z
          .boolean()
          .optional()
          .describe(
            "Also return each set's games (stage, winner, character selections) and derivedCharacters. " +
              "Forces perPage <= 10 because of start.gg's complexity cap. Default false.",
          ),
        page: s.page,
        // ~26-34 nested objects per set; start.gg caps a request at 1000 objects,
        // so perPage above ~30 gets rejected with a complexity error.
        // includeGames nests games (~8 objects each); the handler clamps perPage to 10.
        perPage: s.perPage(30, 20),
        fetchAll: FETCH_ALL,
      },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      const vars = eventLocator(args);
      const filters: Record<string, unknown> = {};
      if (args.state) filters.state = s.setStatesToInts(args.state);
      if (args.phaseIds) filters.phaseIds = args.phaseIds;
      if (args.roundNumber !== undefined) filters.roundNumber = args.roundNumber;
      if (args.entrantIds) filters.entrantIds = args.entrantIds;
      if (args.playerIds) filters.playerIds = args.playerIds;
      if (args.showByes !== undefined) filters.showByes = args.showByes;
      if (args.hasVod !== undefined) filters.hasVod = args.hasVod;

      const includeGames = Boolean(args.includeGames);
      const operation = includeGames ? "GetEventSetsWithGames" : "GetEventSets";
      const baseVars = {
        ...vars,
        ...(args.sortType ? { sortType: args.sortType } : {}),
        ...(Object.keys(filters).length > 0 ? { filters } : {}),
      };
      const getPage = async (page: number, perPage: number) => {
        const data = await ctx.client.request<any>(
          operation,
          { ...baseVars, page, perPage },
          { cacheTtlMs: TTL.sets },
        );
        const e = data?.event;
        if (!e) throw notFound(describeLocator(vars));
        return e;
      };

      if (args.fetchAll) {
        const perPage = includeGames ? 10 : 30;
        const first = await getPage(1, perPage);
        const { nodes, pageInfo } = await fetchAllPages(
          async (page) => (page === 1 ? first : await getPage(page, perPage)).sets,
          perPage,
          FETCH_ALL_MAX_PAGES.sets,
        );
        return {
          event: { id: first.id, name: first.name ?? null, slug: first.slug ?? null },
          pageInfo,
          sets: nodes.map(normalizeSet).filter(Boolean),
        };
      }

      const perPage = includeGames ? Math.min(args.perPage ?? 10, 10) : (args.perPage ?? 20);
      const e = await getPage(args.page ?? 1, perPage);
      return {
        event: { id: e.id, name: e.name ?? null, slug: e.slug ?? null },
        pageInfo: normalizePageInfo(e.sets?.pageInfo),
        sets: (e.sets?.nodes ?? []).map(normalizeSet).filter(Boolean),
      };
    }),
  );
}
