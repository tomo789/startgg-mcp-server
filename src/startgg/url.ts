import { invalidInput } from "./errors.js";

export interface ParsedStartggUrl {
  type: "tournament" | "event";
  /** Bare tournament slug, e.g. "genesis-9" (no "tournament/" prefix). */
  tournamentSlug: string;
  /** Bare event slug, e.g. "ultimate-singles". Present when type is "event". */
  eventSlug?: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9\-_.]*$/i;
const KNOWN_HOSTS = new Set(["start.gg", "www.start.gg", "smash.gg", "www.smash.gg"]);

/**
 * Parse a start.gg tournament/event URL (or bare path/slug) without touching
 * the network. Accepted inputs:
 *   https://www.start.gg/tournament/<t>/event/<e>[/...]
 *   https://start.gg/tournament/<t>[/details|/events|...]
 *   www.start.gg/tournament/<t>/event/<e>   (scheme-less known host)
 *   start.gg/tournament/<t>
 *   tournament/<t>/event/<e>
 *   tournament/<t>
 *   <t>/event/<e>            (event slug without the "tournament/" prefix)
 *   <t>                      (bare tournament slug)
 */
export function parseStartggUrl(input: string): ParsedStartggUrl {
  const trimmed = input.trim();
  if (!trimmed) throw invalidInput("Empty URL or slug.");

  let path = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw invalidInput(`Not a valid URL: ${trimmed}`);
    }
    if (!KNOWN_HOSTS.has(url.hostname.toLowerCase())) {
      throw invalidInput(
        `Host "${url.hostname}" is not start.gg. Expected a start.gg (or legacy smash.gg) URL.`,
      );
    }
    path = url.pathname;
  } else if (trimmed.includes("://")) {
    throw invalidInput(`Unsupported URL scheme in: ${trimmed}`);
  } else {
    const rawSegs = trimmed.split("/").filter(Boolean);
    if (rawSegs[0] && KNOWN_HOSTS.has(rawSegs[0].toLowerCase())) {
      path = rawSegs.slice(1).join("/");
    }
  }

  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw invalidInput("The URL has no path. Expected /tournament/<slug>[/event/<slug>].");
  }

  let tournamentSlug: string;
  let rest: string[];
  if (segments[0]!.toLowerCase() === "tournament") {
    if (segments.length < 2) {
      throw invalidInput("Missing tournament slug after /tournament/.");
    }
    tournamentSlug = segments[1]!;
    rest = segments.slice(2);
  } else if (segments.length === 1) {
    // Bare slug, e.g. "genesis-9".
    tournamentSlug = segments[0]!;
    rest = [];
  } else if (segments.length >= 3 && segments[1]!.toLowerCase() === "event") {
    tournamentSlug = segments[0]!;
    rest = segments.slice(1);
  } else {
    throw invalidInput(
      `Unrecognized start.gg path "/${segments.join("/")}". ` +
        "Only tournament and event URLs are supported (/tournament/<slug>[/event/<slug>]).",
    );
  }

  if (!SLUG_RE.test(tournamentSlug)) {
    throw invalidInput(`"${tournamentSlug}" does not look like a valid start.gg slug.`);
  }

  const eventIdx = rest.findIndex((s) => s.toLowerCase() === "event");
  if (eventIdx !== -1) {
    const eventSlug = rest[eventIdx + 1];
    if (!eventSlug || !SLUG_RE.test(eventSlug)) {
      throw invalidInput("Missing or invalid event slug after /event/.");
    }
    return { type: "event", tournamentSlug, eventSlug };
  }

  return { type: "tournament", tournamentSlug };
}

/** "tournament/foo", a full URL, or "foo" -> bare slug "foo". */
export function toTournamentSlug(input: string): string {
  return parseStartggUrl(input).tournamentSlug;
}

/** Compose the API-side event slug: "tournament/<t>/event/<e>". */
export function composeEventSlug(tournamentSlug: string, eventSlug: string): string {
  return `tournament/${tournamentSlug}/event/${eventSlug}`;
}
