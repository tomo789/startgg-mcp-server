import { describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StartggClient } from "../src/startgg/client.js";
import { RateLimiter } from "../src/startgg/rate-limit.js";
import { registerAllTools } from "../src/tools/index.js";

const EXPECTED_TOOLS = [
  "search_videogames",
  "search_tournaments",
  "get_upcoming_tournaments",
  "get_tournaments_by_videogame",
  "get_tournament",
  "get_tournament_events",
  "get_tournament_entrants",
  "get_event",
  "get_event_entrants",
  "get_event_standings",
  "get_event_sets",
  "get_player",
  "get_player_sets",
  "get_stream_queue",
  "resolve_startgg_url",
];

/** Scripted GraphQL backend keyed by operationName. */
function makeConnectedPair(
  responses: Record<string, unknown>,
  { token = "test-token" }: { token?: string | undefined } = {},
) {
  const seen: { operationName: string; variables: Record<string, unknown> }[] = [];
  const fetchFn = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    seen.push({ operationName: body.operationName, variables: body.variables });
    const data = responses[body.operationName];
    if (data === undefined) {
      return new Response(JSON.stringify({ errors: [{ message: "unscripted operation" }] }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ data }), { status: 200 });
  }) as typeof fetch;

  const startgg = new StartggClient({
    token,
    fetchFn,
    limiter: new RateLimiter({ maxRequests: 1000, windowMs: 60_000, sleep: async () => undefined }),
  });
  const server = new McpServer({ name: "startgg-mcp-server-test", version: "0.0.0" });
  registerAllTools(server, { client: startgg });

  const connect = async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
  };
  return { connect, seen };
}

function parsePayload(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content as { type: string; text: string }[];
  return JSON.parse(content[0]!.text);
}

describe("MCP tool surface", () => {
  it("lists all documented tools", async () => {
    const { connect } = makeConnectedPair({});
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
    }
  });

  it("search_videogames returns normalized results", async () => {
    const { connect, seen } = makeConnectedPair({
      SearchVideogames: {
        videogames: {
          pageInfo: { page: 1, perPage: 25, total: 1, totalPages: 1 },
          nodes: [
            {
              id: 1386,
              name: "Super Smash Bros. Ultimate",
              displayName: "Ultimate",
              slug: "game/ultimate",
            },
          ],
        },
      },
    });
    const client = await connect();
    const result = await client.callTool({
      name: "search_videogames",
      arguments: { name: "smash" },
    });
    expect(result.isError).toBeFalsy();
    const payload = parsePayload(result);
    expect(payload.videogames[0]).toMatchObject({ id: 1386, displayName: "Ultimate" });
    expect(payload.pageInfo.total).toBe(1);
    expect(seen[0]).toMatchObject({ operationName: "SearchVideogames" });
  });

  it("rejects invalid arguments before any API call", async () => {
    const { connect, seen } = makeConnectedPair({});
    const client = await connect();
    const result = await client.callTool({
      name: "search_videogames",
      arguments: { name: "x", perPage: 9999 },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as { text: string }[])[0]!.text;
    expect(text).toContain("Input validation error");
    expect(seen).toHaveLength(0);
  });

  it("returns a structured INVALID_INPUT error for ambiguous locators", async () => {
    const { connect, seen } = makeConnectedPair({});
    const client = await connect();
    const result = await client.callTool({
      name: "get_tournament",
      arguments: { slug: "genesis-9", tournamentId: 1 },
    });
    expect(result.isError).toBe(true);
    expect(parsePayload(result).error.code).toBe("INVALID_INPUT");
    expect(seen).toHaveLength(0);
  });

  it("fails safely with AUTH_ERROR when no token is configured", async () => {
    // Empty string models "not configured" (destructuring defaults keep undefined out).
    const { connect } = makeConnectedPair({}, { token: "" });
    const client = await connect();
    const result = await client.callTool({
      name: "search_videogames",
      arguments: { name: "smash" },
    });
    expect(result.isError).toBe(true);
    const payload = parsePayload(result);
    expect(payload.error.code).toBe("AUTH_ERROR");
    expect(payload.error.message).toContain("STARTGG_TOKEN");
  });

  it("resolve_startgg_url resolves an event URL end to end", async () => {
    const { connect, seen } = makeConnectedPair({
      ResolveEvent: {
        event: {
          id: 456,
          name: "Ultimate Singles",
          slug: "tournament/genesis-9/event/ultimate-singles",
          tournament: { id: 123, name: "Genesis 9", slug: "tournament/genesis-9" },
        },
      },
    });
    const client = await connect();
    const result = await client.callTool({
      name: "resolve_startgg_url",
      arguments: { url: "https://www.start.gg/tournament/genesis-9/event/ultimate-singles" },
    });
    const payload = parsePayload(result);
    expect(payload).toEqual({
      type: "event",
      tournamentSlug: "genesis-9",
      eventSlug: "ultimate-singles",
      tournamentId: 123,
      tournamentName: "Genesis 9",
      eventId: 456,
      eventName: "Ultimate Singles",
    });
    expect(seen[0]!.variables).toEqual({
      slug: "tournament/genesis-9/event/ultimate-singles",
    });
  });

  it("get_event_sets maps state names to integers in the API filter", async () => {
    const { connect, seen } = makeConnectedPair({
      GetEventSets: {
        event: {
          id: 1,
          name: "Singles",
          slug: "tournament/t/event/e",
          sets: { pageInfo: { page: 1, perPage: 20, total: 0, totalPages: 0 }, nodes: [] },
        },
      },
    });
    const client = await connect();
    const result = await client.callTool({
      name: "get_event_sets",
      arguments: { eventId: 1, state: ["COMPLETED"] },
    });
    expect(result.isError).toBeFalsy();
    expect(seen[0]!.variables).toMatchObject({ id: 1, filters: { state: [3] } });
  });

  it("get_stream_queue fetches queue and tournament in one request for URL locators", async () => {
    const { connect, seen } = makeConnectedPair({
      GetStreamQueue: {
        tournament: {
          id: 999,
          name: "Weekly",
          streamQueue: [
            {
              id: "q1",
              stream: { id: 5, streamSource: "TWITCH", streamName: "chan" },
              sets: [],
            },
          ],
        },
      },
    });
    const client = await connect();
    const result = await client.callTool({
      name: "get_stream_queue",
      arguments: { url: "https://www.start.gg/tournament/weekly/details" },
    });
    const payload = parsePayload(result);
    expect(payload.tournament).toEqual({ id: 999, name: "Weekly" });
    expect(payload.streamQueues[0].stream.derivedUrl).toBe("https://www.twitch.tv/chan");
    expect(seen.map((s) => s.operationName)).toEqual(["GetStreamQueue"]);
    expect(seen[0]!.variables).toEqual({ slug: "weekly" });
  });

  it("get_stream_queue surfaces NOT_FOUND for a numeric id that does not exist", async () => {
    const { connect, seen } = makeConnectedPair({ GetStreamQueue: { tournament: null } });
    const client = await connect();
    const result = await client.callTool({
      name: "get_stream_queue",
      arguments: { tournamentId: 424242 },
    });
    expect(result.isError).toBe(true);
    expect(parsePayload(result).error.code).toBe("NOT_FOUND");
    expect(seen.map((s) => s.operationName)).toEqual(["GetStreamQueue"]);
    expect(seen[0]!.variables).toEqual({ id: 424242 });
  });

  it("get_stream_queue treats a null streamQueue on an existing tournament as empty", async () => {
    const { connect } = makeConnectedPair({
      GetStreamQueue: { tournament: { id: 77, name: "Quiet Weekly", streamQueue: null } },
    });
    const client = await connect();
    const result = await client.callTool({
      name: "get_stream_queue",
      arguments: { tournamentId: 77 },
    });
    expect(result.isError).toBeFalsy();
    const payload = parsePayload(result);
    expect(payload.tournament).toEqual({ id: 77, name: "Quiet Weekly" });
    expect(payload.streamQueues).toEqual([]);
  });

  it("get_upcoming_tournaments reuses the cache for same-minute calls", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-08-25T12:00:05Z"));
      const { connect, seen } = makeConnectedPair({
        SearchTournaments: {
          tournaments: { pageInfo: { page: 1, perPage: 25, total: 0, totalPages: 0 }, nodes: [] },
        },
      });
      const client = await connect();
      await client.callTool({ name: "get_upcoming_tournaments", arguments: { videogameId: 1386 } });
      // Same minute, different second: beforeDate must floor to the same value
      // so the second call is served from the 60s search cache.
      vi.setSystemTime(new Date("2026-08-25T12:00:47Z"));
      await client.callTool({ name: "get_upcoming_tournaments", arguments: { videogameId: 1386 } });
      expect(seen).toHaveLength(1);
      const filter = seen[0]!.variables.filter as { beforeDate: number };
      const minuteFloor = Math.floor(Date.parse("2026-08-25T12:00:00Z") / 1000);
      expect(filter.beforeDate).toBe(minuteFloor + 30 * 86400);
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces NOT_FOUND for missing tournaments", async () => {
    const { connect } = makeConnectedPair({ GetTournament: { tournament: null } });
    const client = await connect();
    const result = await client.callTool({
      name: "get_tournament",
      arguments: { slug: "does-not-exist-xyz" },
    });
    expect(result.isError).toBe(true);
    expect(parsePayload(result).error.code).toBe("NOT_FOUND");
  });
});
