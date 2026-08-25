#!/usr/bin/env node
/**
 * Example: Super Smash Bros. Ultimate tournament watcher.
 *
 * Demonstrates the intended flow of this repo's start.gg client for a
 * tournament-monitoring app (all game-specific logic lives HERE, not in the
 * MCP server):
 *
 *   1. look up the Ultimate videogame id by name
 *   2. list upcoming Ultimate tournaments (next 7 days, largest first)
 *   3. for the most recent completed sets of a chosen event, compute
 *      upset candidates from seed differences
 *
 * Usage:
 *   npm run build
 *   STARTGG_TOKEN=... node examples/smash-ultimate-watcher/watch.mjs [event-slug-or-url]
 *
 * Without an event argument it just lists upcoming tournaments.
 */
import { StartggClient } from "../../dist/startgg/client.js";
import { normalizeSet, normalizeTournament } from "../../dist/startgg/normalize.js";
import { parseStartggUrl, composeEventSlug } from "../../dist/startgg/url.js";

const token = process.env.STARTGG_TOKEN;
if (!token) {
  console.error("Set STARTGG_TOKEN first (https://start.gg/admin/profile/developer).");
  process.exit(1);
}
const client = new StartggClient({ token });

// 1. find the videogame id (Ultimate is 1386, but resolve it like a real app would)
const vg = await client.request("SearchVideogames", {
  name: "Super Smash Bros. Ultimate",
  page: 1,
  perPage: 5,
});
const ultimate = vg.videogames.nodes.find((v) => v.name === "Super Smash Bros. Ultimate");
if (!ultimate) throw new Error("Ultimate not found in videogame search");
console.log(`videogame: ${ultimate.name} (id ${ultimate.id})\n`);

// 2. upcoming tournaments in the next 7 days
const now = Math.floor(Date.now() / 1000);
const upcoming = await client.request("SearchTournaments", {
  page: 1,
  perPage: 10,
  sortBy: "startAt asc",
  filter: { upcoming: true, videogameIds: [ultimate.id], beforeDate: now + 7 * 86400 },
});
console.log("Upcoming Ultimate tournaments (7 days):");
for (const raw of upcoming.tournaments.nodes) {
  const t = normalizeTournament(raw);
  console.log(`  ${t.startAt}  ${t.name}  [${t.numAttendees ?? "?"} attendees]  ${t.url ?? ""}`);
}

// 3. upset watch for one event (pass an event URL/slug as argv[2])
const eventArg = process.argv[2];
if (!eventArg) {
  console.log("\nPass an event URL to compute upset candidates, e.g.");
  console.log(
    "  node examples/smash-ultimate-watcher/watch.mjs https://www.start.gg/tournament/<t>/event/<e>",
  );
  process.exit(0);
}
const parsed = parseStartggUrl(eventArg);
if (parsed.type !== "event") throw new Error("Pass an event URL, not a tournament URL.");
const slug = composeEventSlug(parsed.tournamentSlug, parsed.eventSlug);

const data = await client.request("GetEventSets", {
  slug,
  page: 1,
  perPage: 30, // start.gg complexity cap: ~26+ objects per set, 1000 per request
  sortType: "RECENT",
  filters: { state: [3] }, // completed
});
const sets = (data.event?.sets?.nodes ?? []).map(normalizeSet).filter(Boolean);
console.log(`\n${data.event?.name}: ${sets.length} recently completed sets`);

// Upset candidate = winner was seeded worse (higher number) than the loser.
const upsets = [];
for (const set of sets) {
  const winner = set.winnerEntrantId === set.entrant1?.entrantId ? set.entrant1 : set.entrant2;
  const loser = winner === set.entrant1 ? set.entrant2 : set.entrant1;
  if (!winner?.seed || !loser?.seed) continue;
  if (winner.seed > loser.seed) {
    upsets.push({ set, winner, loser, seedDiff: winner.seed - loser.seed });
  }
}
upsets.sort((a, b) => b.seedDiff - a.seedDiff);

if (upsets.length === 0) {
  console.log("No upsets in this batch.");
} else {
  console.log("Upset candidates (largest seed gap first):");
  for (const { set, winner, loser, seedDiff } of upsets) {
    console.log(
      `  [+${seedDiff}] ${set.round}: seed ${winner.seed} ${winner.name} beat ` +
        `seed ${loser.seed} ${loser.name}  (${set.score.displayScore ?? "?"})`,
    );
  }
}
