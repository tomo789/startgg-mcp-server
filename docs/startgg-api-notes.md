# start.gg API notes (verified)

Facts verified against the live API via GraphQL introspection and probe
queries on 2026-08-24. Sources: https://developer.start.gg and live responses
from `https://api.start.gg/gql/alpha`. **Do not add fields to the GraphQL
documents without checking them against the schema first** (`npm run` nothing —
use an introspection query; the schema is not vendored here).

## Endpoint & limits

- Endpoint: `POST https://api.start.gg/gql/alpha`, `Authorization: Bearer <token>`
- Rate limit (documented): max 80 requests per 60 seconds
- Complexity limit (documented + observed): max **1000 objects per request**,
  nested objects included. Observed: an event-sets page with our selection is
  ~26 objects per set — `perPage: 40` was rejected with
  `"Your query complexity is too high ... (actual: 1041)"`, `perPage: 30` passes.
- Concurrency limit: not documented; nothing verified.

## Schema facts that shaped the design

- `Set.state` is an **Int**, but `Event.state` and `Phase.state` are the
  `ActivityState` enum (`CREATED, ACTIVE, COMPLETED, READY, INVALID, CALLED, QUEUED`).
  Decoding the Int as 1-based ordinals of that enum matches every observed
  value: `1` = un-started preview set, `3` = completed set, `5` = unplayed
  Grand Final Reset. `2/4/6/7` follow the same rule but were not directly
  observed; normalized output therefore always includes `stateRaw`.
- `Set.round` is an **Int** (negative = losers bracket); the human-readable
  name is `fullRoundText`.
- Set ids are usually numbers but **preview (pre-bracket-finalization) sets
  have string ids** like `preview_3430499_2_0`.
- Scores live at `slots[].standing.stats.score.value` (`Score { label, value,
displayValue }`). A value of `-1` is the DQ marker; `displayScore` shows "DQ".
- Seeds: `Entrant.initialSeedNum` is the event seed used for upset math.
  (`Entrant.seeds[]` exists per phase but costs many objects.)
- `Streams` has **no `url` field**. `streamSource` enum:
  `TWITCH, HITBOX, STREAMME, MIXER, YOUTUBE`. A URL can be derived reliably
  only for TWITCH (`twitch.tv/<streamName>`); observed YOUTUBE `streamName`
  values are display names (e.g. "まえだくん"), not channel handles, so we
  derive nothing for them (`derivedUrl: null`).
- Stream queues: `Query.streamQueue(tournamentId: ID!)` (also
  `Tournament.streamQueue`). Returns **null**, not `[]`, when nothing is queued.
- `tournaments(query: {...})` supports `sortBy: "startAt asc" | "startAt desc" |
"endAt desc"` (string field + direction; verified working). The
  `TournamentPageFilter.upcoming: true` filter **includes tournaments currently
  in progress** (observed: tournaments started hours earlier still listed).
- `tournament(slug:)` accepts the bare slug (`"genesis-9"`); `event(slug:)`
  needs the full form (`"tournament/<t>/event/<e>"`).
- All timestamps are Unix epoch **seconds**.
- Connection types (`nodes` + `pageInfo { total totalPages page perPage }`):
  tournaments, videogames, entrants (`EventEntrantPageQuery`), standings
  (`StandingPaginationQuery`), sets (`page/perPage/sortType/filters` args),
  participants (`ParticipantPaginationQuery`). `Tournament.events` is a plain
  list with `filter: EventFilter` (`videogameId: [ID]`), not a connection.
- `SetFilters` (event sets & player sets): `state: [Int]`, `phaseIds`,
  `entrantIds`, `playerIds`, `roundNumber`, `showByes`, `hasVod`,
  `hideEmpty`, `updatedAfter`, ...
- Players: `Query.player(id: ID!)` only (no name lookup);
  `Player.sets(page, perPage, filters)` for recent sets.
- `Query.videogames(query: { filter: { name } })` — `VideogamePageFilter` is
  `{ id: [ID], name: String, forUser: ID }`.

## MCP SDK pin

Built and verified against `@modelcontextprotocol/sdk` **1.x**
(`registerTool(name, config, handler)` with a **raw Zod shape** — not
`z.object(...)` — as `inputSchema`). The `@modelcontextprotocol/server`
package (2.x alpha) is a different API surface; do not mix them.

## Games, character selections, and streams

Verified 2026-09-02 via live introspection and probe queries.

- `Query.set(id: ID): Set` exists. Preview (unstarted) sets have string ids
  like `preview_3430499_2_0` and are **not** fetchable this way.
- `Set.games: [Game]`, `Set.stream: Streams`, `Set.setGamesType: Int`.
- `Game { id: ID, orderNum: Int, state: Int, winnerId: Int, entrant1Score:
Int, entrant2Score: Int, stage: Stage { id name }, selections:
[GameSelection], images }`. `entrant1Score`/`entrant2Score` are frequently
  null even on reported sets; `winnerId` is the reliable field.
- `GameSelection { id, orderNum, selectionType: GameSelectionType (only
value: CHARACTER), selectionValue: Int (= character id), entrant: Entrant
{ id }, participant, character: Character { id name } }`.
- `Streams { id, streamName, streamSource: StreamSource (TWITCH | YOUTUBE |
...), ... }`.
- Complexity: start.gg caps 1000 objects/request; a set with the existing
  selection is ~26 objects, and nesting games (up to 5 games × ~8 objects)
  makes `perPage` 10 the safe maximum (verified live).
- Coverage (measured 2026-09-02): character/stage data exists only when the
  set was reported with it. Late-round/streamed completed sets: **18/20**
  had characters (both a 35-entrant weekly and Supernova 2025 with 2433
  entrants). Round-1 pools sets at Supernova: **1/20** (8 of 20 were DQs).
  So Top 8 style use works; whole-event character statistics do not.
- `Query` root has no player/tag search (`player(id)` only); tag search
  exists only inside a tournament/event via participants/entrants filters.
- `tournament(slug:).events` can be null for old tournaments (observed:
  genesis-9); treat as `[]`.
