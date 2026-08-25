import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * GraphQL documents live in <package root>/graphql/*.graphql so they can be
 * edited without touching TypeScript. A document may contain several named
 * operations; requests select one via operationName.
 */
const GRAPHQL_DIR = fileURLToPath(new URL("../../graphql/", import.meta.url));

const documentCache = new Map<string, string>();

export function loadDocument(file: string): string {
  const cached = documentCache.get(file);
  if (cached) return cached;
  const text = readFileSync(join(GRAPHQL_DIR, `${file}.graphql`), "utf8");
  documentCache.set(file, text);
  return text;
}

/** Operation registry: operation name -> document file that defines it. */
export const OPERATIONS = {
  SearchVideogames: "videogames",
  SearchTournaments: "tournaments",
  GetTournament: "tournament",
  GetTournamentEvents: "tournament",
  GetTournamentParticipants: "participants",
  GetEvent: "event",
  GetEventEntrants: "entrants",
  GetEventStandings: "standings",
  GetEventSets: "sets",
  GetStreamQueue: "streams",
  GetPlayer: "players",
  GetPlayerSets: "players",
  ResolveTournament: "resolve",
  ResolveEvent: "resolve",
} as const;

export type OperationName = keyof typeof OPERATIONS;

export function loadOperation(operation: OperationName): string {
  return loadDocument(OPERATIONS[operation]);
}
