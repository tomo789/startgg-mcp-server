import type { StartggClient } from "../startgg/client.js";
import { invalidInput, toStartggError } from "../startgg/errors.js";
import { normalizePageInfo, type NormalizedPageInfo } from "../startgg/normalize.js";
import { parseStartggUrl, composeEventSlug } from "../startgg/url.js";

export interface ToolContext {
  client: StartggClient;
}

/** Cache TTLs (ms) per data category. Metadata changes rarely; live data does. */
export const TTL = {
  videogames: 6 * 60 * 60 * 1000,
  tournamentMeta: 5 * 60 * 1000,
  eventMeta: 5 * 60 * 1000,
  search: 60 * 1000,
  entrants: 60 * 1000,
  standings: 30 * 1000,
  sets: 30 * 1000,
  streamQueue: 15 * 1000,
  player: 5 * 60 * 1000,
  resolve: 60 * 60 * 1000,
} as const;

interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/**
 * Wrap a tool handler: successful returns become pretty-printed JSON, thrown
 * errors become a structured { error: { code, message } } payload with
 * isError set. Tokens and stack traces never reach the client.
 */
export function wrapHandler<Args>(
  handler: (args: Args) => Promise<unknown>,
): (args: Args) => Promise<ToolResult> {
  return async (args: Args) => {
    try {
      return jsonResult(await handler(args));
    } catch (err) {
      const e = toStartggError(err);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { error: { code: e.code, message: e.message, ...(e.details ?? {}) } },
              null,
              2,
            ),
          },
        ],
      };
    }
  };
}

// ---------- locator resolution ----------

export interface TournamentLocatorArgs {
  tournamentId?: number | undefined;
  slug?: string | undefined;
  url?: string | undefined;
}

/** Resolve tool args to GraphQL variables { id } or { slug } for tournament(...). */
export function tournamentLocator(args: TournamentLocatorArgs): { id?: number; slug?: string } {
  const given = [args.tournamentId, args.slug, args.url].filter((v) => v !== undefined);
  if (given.length !== 1) {
    throw invalidInput(
      "Provide exactly one of: tournamentId, slug, or url to identify the tournament.",
    );
  }
  if (args.tournamentId !== undefined) return { id: args.tournamentId };
  const parsed = parseStartggUrl(args.url ?? args.slug ?? "");
  return { slug: parsed.tournamentSlug };
}

export interface EventLocatorArgs {
  eventId?: number | undefined;
  slug?: string | undefined;
  url?: string | undefined;
}

/** Resolve tool args to GraphQL variables { id } or { slug } for event(...). */
export function eventLocator(args: EventLocatorArgs): { id?: number; slug?: string } {
  const given = [args.eventId, args.slug, args.url].filter((v) => v !== undefined);
  if (given.length !== 1) {
    throw invalidInput("Provide exactly one of: eventId, slug, or url to identify the event.");
  }
  if (args.eventId !== undefined) return { id: args.eventId };
  const parsed = parseStartggUrl(args.url ?? args.slug ?? "");
  if (parsed.type !== "event" || !parsed.eventSlug) {
    throw invalidInput(
      "This locator points at a tournament, not an event. Pass an event URL/slug like " +
        '"tournament/<t>/event/<e>", or list events first with get_tournament_events.',
    );
  }
  return { slug: composeEventSlug(parsed.tournamentSlug, parsed.eventSlug) };
}

// ---------- dates ----------

/** Accept ISO-8601 strings or Unix epoch seconds; return epoch seconds. */
export function toEpochSeconds(value: string | number, argName: string): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || value > 4102444800) {
      throw invalidInput(`${argName}: expected Unix epoch seconds, got ${value}.`);
    }
    return Math.floor(value);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw invalidInput(
      `${argName}: could not parse "${value}". Use ISO-8601 (e.g. "2026-08-24T00:00:00Z") ` +
        "or Unix epoch seconds.",
    );
  }
  return Math.floor(ms / 1000);
}

// ---------- pagination ----------

export interface FetchAllPageInfo {
  total: number | null;
  totalPages: number | null;
  perPage: number;
  fetchedPages: number;
  /** True when the safety cap stopped fetching before the last page. */
  truncated: boolean;
}

/**
 * Fetch multiple pages with a hard page cap so fetchAll can never stampede
 * the API. `getPage` returns the raw connection { pageInfo, nodes }.
 */
export async function fetchAllPages<TNode>(
  getPage: (page: number) => Promise<{ pageInfo?: unknown; nodes?: TNode[] } | undefined>,
  perPage: number,
  maxPages: number,
): Promise<{ nodes: TNode[]; pageInfo: FetchAllPageInfo }> {
  const nodes: TNode[] = [];
  let info: NormalizedPageInfo | undefined;
  let page = 1;
  for (; page <= maxPages; page++) {
    const conn = await getPage(page);
    if (!conn) break;
    info = normalizePageInfo(conn.pageInfo);
    const batch = conn.nodes ?? [];
    nodes.push(...batch);
    const totalPages = info.totalPages;
    if (totalPages !== null && page >= totalPages) {
      return {
        nodes,
        pageInfo: {
          total: info.total,
          totalPages,
          perPage,
          fetchedPages: page,
          truncated: false,
        },
      };
    }
    if (batch.length === 0) break;
  }
  const fetchedPages = Math.min(page, maxPages);
  const totalPages = info?.totalPages ?? null;
  return {
    nodes,
    pageInfo: {
      total: info?.total ?? null,
      totalPages,
      perPage,
      fetchedPages,
      truncated: totalPages !== null ? fetchedPages < totalPages : false,
    },
  };
}
