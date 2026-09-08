#!/usr/bin/env node
/**
 * End-to-end smoke test: spawns the built server over stdio and exercises the
 * main tools against the live start.gg API (~10 requests).
 *
 * Usage: STARTGG_TOKEN=... node scripts/smoke.mjs [event-url]
 * Run `npm run build` first.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

if (!process.env.STARTGG_TOKEN) {
  console.error("STARTGG_TOKEN is not set; aborting smoke test.");
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/cli.js"],
  env: { ...process.env },
  stderr: "inherit",
});
const client = new Client({ name: "smoke-client", version: "0.0.0" });
await client.connect(transport);

let failures = 0;

function report(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
}

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.[0]?.text ?? "{}";
  return { isError: !!result.isError, payload: JSON.parse(text) };
}

// 1. tool listing
const { tools } = await client.listTools();
report("listTools", tools.length === 16, `${tools.length} tools`);

// 2. videogame search
const vg = await call("search_videogames", { name: "Super Smash Bros. Ultimate" });
const ultimate = vg.payload.videogames?.find((v) => v.id === 1386);
report("search_videogames", !vg.isError && !!ultimate, ultimate?.displayName);

// 3. upcoming tournaments for Ultimate
const up = await call("get_upcoming_tournaments", {
  videogameId: 1386,
  withinDays: 7,
  perPage: 3,
});
report(
  "get_upcoming_tournaments",
  !up.isError && Array.isArray(up.payload.tournaments) && up.payload.tournaments.length > 0,
  up.payload.tournaments?.[0]?.name,
);

// 4. resolve a real event URL (default: a completed 2026 weekly)
const eventUrl =
  process.argv[2] ??
  "https://www.start.gg/tournament/baeverse-battles-70-5/event/baeverse-battles-70";
const resolved = await call("resolve_startgg_url", { url: eventUrl });
report(
  "resolve_startgg_url",
  !resolved.isError && resolved.payload.type === "event" && !!resolved.payload.eventId,
  `eventId=${resolved.payload.eventId}`,
);

// 5. tournament details
const t = await call("get_tournament", { tournamentId: resolved.payload.tournamentId });
report(
  "get_tournament",
  !t.isError && !!t.payload.tournament?.url && Array.isArray(t.payload.events),
  t.payload.tournament?.name,
);

// 6. event entrants with seeds
const entrants = await call("get_event_entrants", {
  eventId: resolved.payload.eventId,
  perPage: 5,
});
const seeded = entrants.payload.entrants?.filter((e) => e.seed !== null) ?? [];
report(
  "get_event_entrants",
  !entrants.isError && entrants.payload.entrants?.length > 0 && seeded.length > 0,
  `${entrants.payload.entrants?.length} entrants, pageInfo.total=${entrants.payload.pageInfo?.total}`,
);

// 7. completed sets, normalized
const sets = await call("get_event_sets", {
  eventId: resolved.payload.eventId,
  state: ["COMPLETED"],
  sortType: "RECENT",
  perPage: 3,
});
const set0 = sets.payload.sets?.[0];
report(
  "get_event_sets",
  !sets.isError &&
    set0?.state === "COMPLETED" &&
    typeof set0?.round === "string" &&
    set0?.entrant1?.entrantId != null &&
    set0?.winnerEntrantId != null,
  `${set0?.round}: ${set0?.score?.displayScore}`,
);

const setGames = await call("get_set_games", { setId: set0.id });
report(
  "get_set_games",
  !setGames.isError &&
    Array.isArray(setGames.payload.set?.games) &&
    Array.isArray(setGames.payload.set?.derivedCharacters),
  `${setGames.payload.set?.games?.length} games, ${JSON.stringify(setGames.payload.set?.derivedCharacters?.[0]?.characters)}`,
);

const setsWithGames = await call("get_event_sets", {
  eventId: resolved.payload.eventId,
  state: ["COMPLETED"],
  sortType: "RECENT",
  perPage: 3,
  includeGames: true,
});
report(
  "get_event_sets includeGames",
  !setsWithGames.isError && Array.isArray(setsWithGames.payload.sets?.[0]?.games),
);

// 8. standings top 8
const standings = await call("get_event_standings", {
  eventId: resolved.payload.eventId,
  perPage: 8,
});
report(
  "get_event_standings",
  !standings.isError && standings.payload.standings?.[0]?.placement === 1,
  `1st: ${standings.payload.standings?.[0]?.entrant?.name}`,
);

// 9. stream queue (empty is fine; must not error)
const queue = await call("get_stream_queue", {
  tournamentId: resolved.payload.tournamentId,
});
report(
  "get_stream_queue",
  !queue.isError && Array.isArray(queue.payload.streamQueues),
  `${queue.payload.streamQueues?.length} queues`,
);

// 10. player sets via a player id found in the sets result
const playerId = set0?.entrant1?.players?.[0]?.playerId;
if (playerId) {
  const ps = await call("get_player_sets", { playerId, perPage: 2 });
  report(
    "get_player_sets",
    !ps.isError && Array.isArray(ps.payload.sets) && ps.payload.sets[0]?.event?.tournament,
    `player ${ps.payload.player?.gamerTag}, ${ps.payload.sets?.length} sets`,
  );
} else {
  report("get_player_sets", false, "no playerId available from sets result");
}

// 11. AUTH_ERROR shape sanity: bad locator should give INVALID_INPUT, not a crash
const bad = await call("get_tournament", {});
report(
  "invalid locator -> INVALID_INPUT",
  bad.isError && bad.payload.error?.code === "INVALID_INPUT",
  bad.payload.error?.code,
);

await client.close();
console.log(failures === 0 ? "\nSMOKE OK" : `\nSMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
