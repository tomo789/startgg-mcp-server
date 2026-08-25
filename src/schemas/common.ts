import { z } from "zod";
import { SET_STATE_NAMES } from "../startgg/normalize.js";

export const page = z
  .number()
  .int()
  .min(1)
  .max(10000)
  .optional()
  .describe("Page number, 1-based. Default 1.");

export function perPage(max: number, def: number) {
  return z
    .number()
    .int()
    .min(1)
    .max(max)
    .optional()
    .describe(`Results per page, max ${max}. Default ${def}.`);
}

export const dateArg = z
  .union([z.string().min(4).max(64), z.number()])
  .describe(
    'ISO-8601 date/time (e.g. "2026-08-24" or "2026-08-24T00:00:00Z") or Unix epoch seconds.',
  );

export const positiveId = z.number().int().positive();

export const urlArg = z.string().min(1).max(500);

export const slugArg = z.string().min(1).max(300);

export const countryCode = z
  .string()
  .regex(/^[A-Za-z]{2}$/, "two-letter ISO country code")
  .describe('Two-letter ISO country code, e.g. "US", "JP".');

export const addrState = z
  .string()
  .min(1)
  .max(50)
  .describe('State/province code as used by start.gg, e.g. "CA", "TX".');

const setStateNames = Object.values(SET_STATE_NAMES) as [string, ...string[]];

export const setStates = z
  .array(z.union([z.enum(setStateNames), z.number().int().min(1).max(7)]))
  .min(1)
  .max(7)
  .describe(
    'Set states to include: names ("CREATED", "ACTIVE", "COMPLETED", ...) or raw integers (1-7). ' +
      "COMPLETED = finished sets.",
  );

/** Convert mixed state names/ints to the raw integers the API expects. */
export function setStatesToInts(states: (string | number)[]): number[] {
  const nameToInt = new Map(Object.entries(SET_STATE_NAMES).map(([k, v]) => [v, Number(k)]));
  return states.map((s) => (typeof s === "number" ? s : nameToInt.get(s)!));
}

// Locator shapes shared by tournament- and event-oriented tools.
export const tournamentLocatorShape = {
  tournamentId: positiveId
    .optional()
    .describe("Numeric start.gg tournament id. Provide exactly one locator."),
  slug: slugArg.optional().describe('Tournament slug, e.g. "genesis-9" or "tournament/genesis-9".'),
  url: urlArg
    .optional()
    .describe("Full start.gg tournament URL, e.g. https://www.start.gg/tournament/genesis-9."),
};

export const eventLocatorShape = {
  eventId: positiveId
    .optional()
    .describe("Numeric start.gg event id. Provide exactly one locator."),
  slug: slugArg.optional().describe('Event slug in the form "tournament/<t>/event/<e>".'),
  url: urlArg
    .optional()
    .describe(
      "Full start.gg event URL, e.g. https://www.start.gg/tournament/genesis-9/event/ultimate-singles.",
    ),
};
