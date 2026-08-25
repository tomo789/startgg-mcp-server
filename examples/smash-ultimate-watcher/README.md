# Smash Ultimate watcher (example)

A small example application built on this repository's start.gg client. It is
**not** an MCP tool — the MCP server stays game-agnostic; game-specific logic
like "which sets are upsets" belongs in applications like this one.

What it does:

1. resolves the Super Smash Bros. Ultimate videogame id by name
2. lists upcoming Ultimate tournaments for the next 7 days
3. given an event URL, fetches its most recently completed sets and ranks
   upset candidates by seed difference

## Run

```bash
npm install
npm run build
STARTGG_TOKEN=... node examples/smash-ultimate-watcher/watch.mjs
# with upset detection for one event:
STARTGG_TOKEN=... node examples/smash-ultimate-watcher/watch.mjs \
  https://www.start.gg/tournament/<tournament>/event/<event>
```

## Where to take it

This is the seed of a worldwide tournament monitor: poll
`SearchTournaments` for tier-relevant events, `GetEventSets` with
`filters.state = [2]` for live sets, `GetStreamQueue` for what is on stream,
and `vodUrl` on completed sets for VOD links.
