# startgg-mcp-server

A [Model Context Protocol](https://modelcontextprotocol.io) server for the
[start.gg](https://www.start.gg) GraphQL API. It lets MCP clients (Claude Code,
Claude Desktop, and others) discover tournaments, inspect events, entrants,
sets, standings, and streams for **any game on start.gg** using natural
language.

## What is this?

start.gg exposes a powerful but complex GraphQL API: entrants vs participants
vs players, integer set states, complexity-limited pagination, epoch
timestamps. This server wraps that API in a small set of MCP tools with:

- **Normalized output** — sets come back as `{ round, state: "COMPLETED", entrant1: { gamerTag, seed }, score, winnerEntrantId, ... }` instead of raw GraphQL nesting
- **URL resolution** — paste a start.gg URL, get tournament/event ids back
- **Built-in rate limiting, retries, and caching** tuned to start.gg's documented limits

The server is game-agnostic. Game-specific logic (e.g. Smash upset detection)
belongs in applications built on top — see
[`examples/smash-ultimate-watcher`](examples/smash-ultimate-watcher/).

## Features

- 15 read-only tools covering discovery, tournaments, events, players, streams, and URL resolution
- Input validation (Zod) on every tool — bad ids, oversized page sizes, and malformed URLs never reach the API
- Sliding-window rate limiter (default 75 req/60s vs start.gg's 80), retries with exponential backoff, and `Retry-After` support
- Short-TTL in-memory cache for metadata queries
- Typed error codes: `AUTH_ERROR`, `RATE_LIMITED`, `NOT_FOUND`, `INVALID_INPUT`, `STARTGG_GRAPHQL_ERROR`, `NETWORK_ERROR`, `INTERNAL_ERROR`
- GraphQL documents kept in [`graphql/`](graphql/) files, separate from code
- The API token never appears in output, logs, or error messages
- Compact JSON output (no pretty-printing) to keep tool results small

## Requirements

- Node.js >= 22
- A start.gg API token

## Getting a start.gg API token

1. Log in to start.gg
2. Open **[developer settings](https://start.gg/admin/profile/developer)** (Profile → Developer Settings)
3. Create a personal access token and copy it

Treat the token like a password. This server reads it only from the
`STARTGG_TOKEN` environment variable.

## Installation

### From npm (recommended)

```bash
# run without installing
npx startgg-mcp-server

# or install globally
npm install -g startgg-mcp-server
```

Requires `STARTGG_TOKEN` in the environment; MCP clients normally launch it for you (see the next section).

### From source

```bash
git clone https://github.com/tomo789/startgg-mcp-server.git
cd startgg-mcp-server
npm install
npm run build
```

## MCP client setup

### Claude Code (CLI)

```bash
claude mcp add startgg --env STARTGG_TOKEN=YOUR_TOKEN -- npx -y startgg-mcp-server
```

Running from a source checkout instead:

```bash
claude mcp add startgg --env STARTGG_TOKEN=YOUR_TOKEN -- node /path/to/startgg-mcp-server/dist/cli.js
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "startgg": {
      "command": "npx",
      "args": ["-y", "startgg-mcp-server"],
      "env": {
        "STARTGG_TOKEN": "YOUR_TOKEN"
      }
    }
  }
}
```

From a source checkout, use `"command": "node"` and `"args": ["/path/to/startgg-mcp-server/dist/cli.js"]` instead.

Any MCP client that supports stdio servers works the same way: run
`node dist/cli.js` (or the `startgg-mcp-server` bin once installed via npm)
with `STARTGG_TOKEN` set.

## Available tools

### Discovery

| Tool                           | Purpose                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `search_videogames`            | Find videogame ids by name (e.g. "Super Smash Bros. Ultimate" → 1386)                                   |
| `search_tournaments`           | General tournament search: name, videogame, country/state, date range, upcoming/past, open registration |
| `get_upcoming_tournaments`     | Tournaments that haven't ended yet (includes in-progress), soonest first, with a days window            |
| `get_tournaments_by_videogame` | Tournaments for one videogame id (upcoming / past / all)                                                |

### Tournament

| Tool                      | Purpose                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `get_tournament`          | Details, schedule, venue, events list, configured streams                                  |
| `get_tournament_events`   | Events (brackets) of a tournament, optionally filtered by videogame                        |
| `get_tournament_entrants` | Tournament-level participants (attendees); per-event seeding lives in `get_event_entrants` |
| `get_stream_queue`        | Stream queue: streams (with derived Twitch URLs) and the sets assigned to each             |

### Event

| Tool                  | Purpose                                                                         |
| --------------------- | ------------------------------------------------------------------------------- |
| `get_event`           | Event details including phases (Pools, Top 8, ...) with phase ids               |
| `get_event_entrants`  | Entrants with seed, players, DQ flag; pagination or `fetchAll`                  |
| `get_event_standings` | Placements (use `perPage: 8` for Top 8)                                         |
| `get_event_sets`      | Normalized sets; filter by state, phase, round, entrants, players, VOD presence |

### Player

| Tool              | Purpose                                      |
| ----------------- | -------------------------------------------- |
| `get_player`      | Player by id: gamer tag, prefix, linked user |
| `get_player_sets` | A player's recent sets across tournaments    |

### Utility

| Tool                  | Purpose                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `resolve_startgg_url` | start.gg URL/slug → `{ type, tournamentId, eventId, slugs, names }` |

Tournament/event tools accept **either** a numeric id, a slug, or a full
start.gg URL. Scheme-less URLs (`start.gg/tournament/...`) and `<t>/event/<e>`
slugs are accepted too — you rarely need `resolve_startgg_url` explicitly, but
it is there when you want the ids.

### Normalized set shape

```json
{
  "id": 106877974,
  "round": "Grand Final",
  "roundNumber": 3,
  "state": "COMPLETED",
  "stateRaw": 3,
  "completedAt": "2026-08-24T07:19:34.000Z",
  "entrant1": {
    "entrantId": 24480092,
    "name": "LittleMacMain",
    "seed": 5,
    "players": [{ "playerId": 3655189, "gamerTag": "LittleMacMain", "prefix": "" }],
    "score": 2
  },
  "entrant2": { "...": "same shape" },
  "score": { "entrant1": 2, "entrant2": 3, "displayScore": "LittleMacMain 2 - RenSuø 3" },
  "winnerEntrantId": 24481002,
  "phase": { "id": 1994001, "name": "Bracket" },
  "vodUrl": null
}
```

Notes grounded in the live API:

- `roundNumber < 0` means losers bracket; `round` is the human-readable name
- a score of `-1` is start.gg's disqualification marker
- unstarted "preview" sets have **string** ids like `"preview_3430499_2_0"`
- `state` names are decoded from the integer `stateRaw`; both are always returned
- `entrant1`/`entrant2` use a `players` array, so doubles/teams work unchanged

## Examples

Things to ask an MCP client once connected:

```text
Find upcoming Super Smash Bros. Ultimate tournaments this week.

Get the entrants and seeds for this start.gg tournament URL:
https://www.start.gg/tournament/.../event/...

Show me completed sets from Top 8 of that event.

Which streams are assigned to sets at this tournament?

What were the biggest seed upsets in this event?
```

A standalone example application (videogame lookup → upcoming tournaments →
sets → upset candidates by seed difference) lives in
[`examples/smash-ultimate-watcher`](examples/smash-ultimate-watcher/).

## Environment variables

| Variable                | Required | Default | Purpose                                                         |
| ----------------------- | -------- | ------- | --------------------------------------------------------------- |
| `STARTGG_TOKEN`         | yes      | —       | start.gg API token                                              |
| `STARTGG_ENABLE_WRITES` | no       | `false` | Reserved. No write tools exist yet; the flag only logs a notice |
| `STARTGG_RATE_LIMIT`    | no       | `75`    | Requests per 60s window (hard-capped at 80)                     |
| `STARTGG_TIMEOUT_MS`    | no       | `30000` | Per-request HTTP timeout                                        |
| `STARTGG_CACHE`         | no       | `on`    | Set `off` to disable the in-memory cache                        |

The API endpoint is deliberately not configurable through the environment: the
token is only ever sent to `api.start.gg`. When using the client as a library
(tests, tooling), inject `apiUrl`/`fetchFn` via the `StartggClient` constructor.

Out-of-range or non-numeric values for `STARTGG_RATE_LIMIT` / `STARTGG_TIMEOUT_MS`
fall back to the default and log a warning on stderr.

Without `STARTGG_TOKEN` the server still starts and lists tools, but every
call returns a clear `AUTH_ERROR` explaining how to fix it.

## Security

- The token is read from the environment only, sent only to `api.start.gg`, and never included in tool output, logs, or error messages
- All tools are read-only; no mutations are implemented
- `.env` files are git-ignored; use `.env.example` as a template
- User-supplied input is schema-validated before any request is built

## Rate limits

start.gg allows **80 requests per 60 seconds** and at most **1000 objects per
request**. This server:

- keeps a sliding-window budget below the request limit (default 75/60s)
- retries `429` (honoring `Retry-After`) and transient 5xx errors with exponential backoff, at most 3 retries — GraphQL errors are never retried
- caps `perPage` per tool so responses stay under the 1000-object complexity limit (sets are expensive: ~26+ objects each, hence `perPage <= 30`)
- caps `fetchAll` at 5 pages per tool (output is meant for an LLM context, so it stays around 100 KB of compact JSON) and reports `truncated: true` when it stops early

## Development

```bash
npm run dev        # run from source (tsx)
npm run build      # compile to dist/
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run format     # prettier
```

GraphQL documents live in `graphql/*.graphql` (one file per domain, multiple
named operations per file; requests select an operation via `operationName`).
Schema facts verified against the live API are recorded in
[`docs/startgg-api-notes.md`](docs/startgg-api-notes.md) — read it before
adding fields.

## Testing

```bash
npm test                    # unit tests (fixtures/mocks only, no network)
STARTGG_INTEGRATION=1 STARTGG_TOKEN=... npm test   # + 2 live API smoke tests
STARTGG_TOKEN=... node scripts/smoke.mjs           # full stdio end-to-end smoke (~10 live requests)
```

Unit tests cover the URL resolver, normalizers, input validation, pagination,
GraphQL/HTTP error handling, the rate limiter, and the cache.

## License

[MIT](LICENSE)
