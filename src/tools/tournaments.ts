import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { notFound } from "../startgg/errors.js";
import {
  normalizeEventSummary,
  normalizePageInfo,
  normalizeParticipant,
  normalizeStream,
  normalizeTournament,
} from "../startgg/normalize.js";
import * as s from "../schemas/common.js";
import { TTL, tournamentLocator, wrapHandler, type ToolContext } from "./shared.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

function describeLocator(vars: { id?: number; slug?: string }): string {
  return vars.id !== undefined ? `Tournament id ${vars.id}` : `Tournament "${vars.slug}"`;
}

export function registerTournamentTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_tournament",
    {
      title: "Get tournament",
      description:
        "Get one tournament's details: schedule, venue/location, registration, its events " +
        "(with videogame and entrant counts), and its configured streams. " +
        "Identify the tournament by numeric id, slug, or start.gg URL.",
      inputSchema: { ...s.tournamentLocatorShape },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      const vars = tournamentLocator(args);
      const data = await ctx.client.request<any>("GetTournament", vars, {
        cacheTtlMs: TTL.tournamentMeta,
      });
      const t = data?.tournament;
      if (!t) throw notFound(describeLocator(vars));
      return {
        tournament: normalizeTournament(t),
        events: (t.events ?? []).map(normalizeEventSummary).filter(Boolean),
        streams: (t.streams ?? []).map(normalizeStream).filter(Boolean),
      };
    }),
  );

  server.registerTool(
    "get_tournament_events",
    {
      title: "Get tournament events",
      description:
        "List the events (brackets) of a tournament, optionally filtered to one videogame id. " +
        "Use the returned event id or slug with get_event_entrants / get_event_sets / get_event_standings.",
      inputSchema: {
        ...s.tournamentLocatorShape,
        videogameId: s.positiveId.optional().describe("Only events for this videogame id."),
      },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      const vars = tournamentLocator(args);
      const data = await ctx.client.request<any>(
        "GetTournamentEvents",
        {
          ...vars,
          ...(args.videogameId !== undefined
            ? { filter: { videogameId: [args.videogameId] } }
            : {}),
        },
        { cacheTtlMs: TTL.eventMeta },
      );
      const t = data?.tournament;
      if (!t) throw notFound(describeLocator(vars));
      return {
        tournament: { id: t.id, name: t.name ?? null, slug: t.slug ?? null },
        events: (t.events ?? []).map(normalizeEventSummary).filter(Boolean),
      };
    }),
  );

  server.registerTool(
    "get_tournament_entrants",
    {
      title: "Get tournament participants",
      description:
        "List a tournament's registered participants (attendees) with gamer tags. " +
        "Note: these are tournament-level registrations; for per-event entrants with " +
        "seeding, use get_event_entrants instead.",
      inputSchema: {
        ...s.tournamentLocatorShape,
        gamerTag: z
          .string()
          .min(1)
          .max(100)
          .optional()
          .describe("Filter participants by gamer tag (contains match)."),
        page: s.page,
        perPage: s.perPage(100, 50),
      },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      const vars = tournamentLocator(args);
      const data = await ctx.client.request<any>(
        "GetTournamentParticipants",
        {
          ...vars,
          page: args.page ?? 1,
          perPage: args.perPage ?? 50,
          ...(args.gamerTag !== undefined ? { gamerTag: args.gamerTag } : {}),
        },
        { cacheTtlMs: TTL.entrants },
      );
      const t = data?.tournament;
      if (!t) throw notFound(describeLocator(vars));
      return {
        tournament: { id: t.id, name: t.name ?? null, slug: t.slug ?? null },
        pageInfo: normalizePageInfo(t.participants?.pageInfo),
        participants: (t.participants?.nodes ?? []).map(normalizeParticipant).filter(Boolean),
      };
    }),
  );
}
