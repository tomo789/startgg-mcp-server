import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { notFound } from "../startgg/errors.js";
import { parseStartggUrl, composeEventSlug } from "../startgg/url.js";
import * as s from "../schemas/common.js";
import { TTL, wrapHandler, type ToolContext } from "./shared.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function registerUtilityTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "resolve_startgg_url",
    {
      title: "Resolve start.gg URL",
      description:
        "Turn a start.gg tournament or event URL (or slug) into internal ids and slugs. " +
        'Example: "https://www.start.gg/tournament/genesis-9/event/ultimate-singles" -> ' +
        "{ type: event, tournamentId, eventId, ... }. Use this first when the user pastes " +
        "a start.gg link, then call the other tools with the returned ids.",
      inputSchema: {
        url: s.urlArg.describe("start.gg URL, path, or slug to resolve."),
      },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      const parsed = parseStartggUrl(args.url);
      if (parsed.type === "event" && parsed.eventSlug) {
        const slug = composeEventSlug(parsed.tournamentSlug, parsed.eventSlug);
        const data = await ctx.client.request<any>(
          "ResolveEvent",
          { slug },
          { cacheTtlMs: TTL.resolve },
        );
        const e = data?.event;
        if (!e) {
          throw notFound(`Event "${slug}"`);
        }
        return {
          type: "event",
          tournamentSlug: parsed.tournamentSlug,
          eventSlug: parsed.eventSlug,
          tournamentId: e.tournament?.id ?? null,
          tournamentName: e.tournament?.name ?? null,
          eventId: e.id,
          eventName: e.name ?? null,
        };
      }

      const data = await ctx.client.request<any>(
        "ResolveTournament",
        { slug: parsed.tournamentSlug },
        { cacheTtlMs: TTL.resolve },
      );
      const t = data?.tournament;
      if (!t) {
        throw notFound(`Tournament "${parsed.tournamentSlug}"`);
      }
      return {
        type: "tournament",
        tournamentSlug: parsed.tournamentSlug,
        tournamentId: t.id,
        tournamentName: t.name ?? null,
      };
    }),
  );
}
