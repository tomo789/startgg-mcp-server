/**
 * Normalization from raw start.gg GraphQL shapes to flat, LLM-friendly objects.
 *
 * Rules:
 * - never invent data: anything the API did not return is null
 * - derived values (not present in the API) get a `derived` prefix
 * - raw enum-ish integers are kept alongside their decoded names
 */

// ---------- normalized output types ----------

export interface NormalizedPageInfo {
  page: number | null;
  perPage: number | null;
  total: number | null;
  totalPages: number | null;
}

export interface NormalizedVideogame {
  id: number;
  name: string | null;
  displayName: string | null;
  slug: string | null;
}

export interface NormalizedTournament {
  id: number;
  name: string | null;
  slug: string | null;
  shortSlug: string | null;
  url: string | null;
  city: string | null;
  addrState: string | null;
  countryCode: string | null;
  postalCode?: string | null;
  venueName: string | null;
  venueAddress?: string | null;
  timezone: string | null;
  startAt: string | null;
  endAt: string | null;
  registrationClosesAt: string | null;
  isRegistrationOpen: boolean | null;
  numAttendees: number | null;
  isOnline: boolean | null;
  hasOfflineEvents: boolean | null;
  hasOnlineEvents: boolean | null;
  links?: { facebook: string | null; discord: string | null } | null;
}

export interface NormalizedEventSummary {
  id: number;
  name: string | null;
  slug: string | null;
  url: string | null;
  startAt: string | null;
  state: string | null;
  numEntrants: number | null;
  isOnline: boolean | null;
  videogame: NormalizedVideogame | null;
}

export interface NormalizedPhase {
  id: number;
  name: string | null;
  numSeeds: number | null;
  phaseOrder: number | null;
  bracketType: string | null;
  state: string | null;
}

export interface NormalizedPlayerRef {
  playerId: number | null;
  gamerTag: string | null;
  prefix: string | null;
}

export interface NormalizedEntrant {
  entrantId: number;
  name: string | null;
  seed: number | null;
  isDisqualified: boolean | null;
  players: NormalizedPlayerRef[];
}

export interface NormalizedStanding {
  placement: number | null;
  isFinal: boolean | null;
  entrant: NormalizedEntrant | null;
}

export interface NormalizedSetSlot {
  entrantId: number | null;
  name: string | null;
  seed: number | null;
  players: NormalizedPlayerRef[];
  /** Games won in this set. -1 means disqualification on start.gg. */
  score: number | null;
}

export interface NormalizedSet {
  /** Usually numeric; unstarted "preview" sets have string ids like "preview_...". */
  id: number | string;
  identifier: string | null;
  /** Human-readable round, e.g. "Winners Quarter-Final" (from fullRoundText). */
  round: string | null;
  /** Numeric round; negative numbers are losers bracket. */
  roundNumber: number | null;
  state: string | null;
  /** Raw integer state as returned by start.gg. */
  stateRaw: number | null;
  startedAt: string | null;
  completedAt: string | null;
  entrant1: NormalizedSetSlot | null;
  entrant2: NormalizedSetSlot | null;
  score: {
    entrant1: number | null;
    entrant2: number | null;
    /** start.gg display string, e.g. "PlayerA 3 - PlayerB 1" or "DQ". */
    displayScore: string | null;
  };
  winnerEntrantId: number | null;
  totalGames: number | null;
  phase: { id: number; name: string | null } | null;
  phaseGroup: { id: number; displayIdentifier: string | null } | null;
  vodUrl: string | null;
  /** Only present in player-set results, where sets span events. */
  event?: {
    id: number;
    name: string | null;
    slug: string | null;
    tournament: { id: number; name: string | null; slug: string | null } | null;
  } | null;
}

export interface NormalizedStream {
  id: number | null;
  /** StreamSource enum: TWITCH | YOUTUBE | HITBOX | STREAMME | MIXER. */
  source: string | null;
  /** Channel name as entered by the organizer. */
  name: string | null;
  game: string | null;
  status: string | null;
  isOnline: boolean | null;
  enabled: boolean | null;
  /**
   * URL derived from source + name; not an API field. Only derived for TWITCH
   * (twitch.tv/<name> is canonical). YOUTUBE stream names are display names,
   * not reliable channel handles, so no URL is derived for them.
   */
  derivedUrl: string | null;
}

export interface NormalizedStreamQueue {
  id: string | null;
  stream: NormalizedStream | null;
  sets: NormalizedSet[];
}

export interface NormalizedPlayer {
  playerId: number;
  gamerTag: string | null;
  prefix: string | null;
  user: { id: number; slug: string | null; name: string | null } | null;
}

// ---------- helpers ----------

const STARTGG_BASE_URL = "https://www.start.gg";

/**
 * Set.state is an integer in the start.gg schema. Names below follow the
 * schema's ActivityState enum order (CREATED, ACTIVE, COMPLETED, READY,
 * INVALID, CALLED, QUEUED) read as 1-based ordinals. Verified against the live
 * API (2026-08-24): 1 = un-started preview set, 3 = completed set,
 * 5 = unplayed "Grand Final Reset". 2/4/6/7 follow the same ordinal rule but
 * were not directly observed; `stateRaw` always carries the original integer.
 */
export const SET_STATE_NAMES: Record<number, string> = {
  1: "CREATED",
  2: "ACTIVE",
  3: "COMPLETED",
  4: "READY",
  5: "INVALID",
  6: "CALLED",
  7: "QUEUED",
};

export function setStateName(state: number | null | undefined): string | null {
  if (state === null || state === undefined) return null;
  return SET_STATE_NAMES[state] ?? null;
}

export function toIso(epochSeconds: number | null | undefined): string | null {
  if (epochSeconds === null || epochSeconds === undefined) return null;
  return new Date(epochSeconds * 1000).toISOString();
}

function absoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/")) return `${STARTGG_BASE_URL}${url}`;
  return url;
}

function slugUrl(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return `${STARTGG_BASE_URL}/${slug}`;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

// ---------- raw input shapes (loose on purpose) ----------
/* eslint-disable @typescript-eslint/no-explicit-any */

export function normalizePageInfo(raw: any): NormalizedPageInfo {
  return {
    page: num(raw?.page),
    perPage: num(raw?.perPage),
    total: num(raw?.total),
    totalPages: num(raw?.totalPages),
  };
}

export function normalizeVideogame(raw: any): NormalizedVideogame | null {
  if (!raw || raw.id == null) return null;
  return {
    id: raw.id,
    name: str(raw.name),
    displayName: str(raw.displayName),
    slug: str(raw.slug),
  };
}

export function normalizeTournament(raw: any): NormalizedTournament | null {
  if (!raw || raw.id == null) return null;
  return {
    id: raw.id,
    name: str(raw.name),
    slug: str(raw.slug),
    shortSlug: str(raw.shortSlug),
    url: absoluteUrl(str(raw.url)) ?? slugUrl(str(raw.slug)),
    city: str(raw.city),
    addrState: str(raw.addrState),
    countryCode: str(raw.countryCode),
    ...(raw.postalCode !== undefined ? { postalCode: str(raw.postalCode) } : {}),
    venueName: str(raw.venueName),
    ...(raw.venueAddress !== undefined ? { venueAddress: str(raw.venueAddress) } : {}),
    timezone: str(raw.timezone),
    startAt: toIso(num(raw.startAt)),
    endAt: toIso(num(raw.endAt)),
    registrationClosesAt: toIso(num(raw.registrationClosesAt)),
    isRegistrationOpen: bool(raw.isRegistrationOpen),
    numAttendees: num(raw.numAttendees),
    isOnline: bool(raw.isOnline),
    hasOfflineEvents: bool(raw.hasOfflineEvents),
    hasOnlineEvents: bool(raw.hasOnlineEvents),
    ...(raw.links !== undefined
      ? {
          links: raw.links
            ? { facebook: str(raw.links.facebook), discord: str(raw.links.discord) }
            : null,
        }
      : {}),
  };
}

export function normalizeEventSummary(raw: any): NormalizedEventSummary | null {
  if (!raw || raw.id == null) return null;
  return {
    id: raw.id,
    name: str(raw.name),
    slug: str(raw.slug),
    url: slugUrl(str(raw.slug)),
    startAt: toIso(num(raw.startAt)),
    state: str(raw.state),
    numEntrants: num(raw.numEntrants),
    isOnline: bool(raw.isOnline),
    videogame: normalizeVideogame(raw.videogame),
  };
}

export function normalizePhase(raw: any): NormalizedPhase | null {
  if (!raw || raw.id == null) return null;
  return {
    id: raw.id,
    name: str(raw.name),
    numSeeds: num(raw.numSeeds),
    phaseOrder: num(raw.phaseOrder),
    bracketType: str(raw.bracketType),
    state: str(raw.state),
  };
}

function normalizePlayers(participants: any): NormalizedPlayerRef[] {
  if (!Array.isArray(participants)) return [];
  return participants.map((p: any) => ({
    playerId: num(p?.player?.id),
    gamerTag: str(p?.player?.gamerTag),
    prefix: str(p?.player?.prefix),
  }));
}

export function normalizeEntrant(raw: any): NormalizedEntrant | null {
  if (!raw || raw.id == null) return null;
  return {
    entrantId: raw.id,
    name: str(raw.name),
    seed: num(raw.initialSeedNum),
    isDisqualified: bool(raw.isDisqualified),
    players: normalizePlayers(raw.participants),
  };
}

export function normalizeStanding(raw: any): NormalizedStanding | null {
  if (!raw) return null;
  return {
    placement: num(raw.placement),
    isFinal: bool(raw.isFinal),
    entrant: normalizeEntrant(raw.entrant),
  };
}

function normalizeSetSlot(raw: any): NormalizedSetSlot | null {
  if (!raw?.entrant || raw.entrant.id == null) return null;
  return {
    entrantId: raw.entrant.id,
    name: str(raw.entrant.name),
    seed: num(raw.entrant.initialSeedNum),
    players: normalizePlayers(raw.entrant.participants),
    score: num(raw.standing?.stats?.score?.value),
  };
}

/**
 * Assign entrant1/entrant2 by the explicit slotIndex field (0/1) rather than
 * trusting array order; falls back to array order when slotIndex is absent.
 */
function orderSlots(slots: any[]): [any, any] {
  const byIndex0 = slots.find((s) => s?.slotIndex === 0);
  const byIndex1 = slots.find((s) => s?.slotIndex === 1);
  if (byIndex0 || byIndex1) {
    const rest = slots.filter((s) => s !== byIndex0 && s !== byIndex1);
    return [byIndex0 ?? rest.shift(), byIndex1 ?? rest.shift()];
  }
  return [slots[0], slots[1]];
}

export function normalizeSet(raw: any): NormalizedSet | null {
  if (!raw || raw.id == null) return null;
  const slots: any[] = Array.isArray(raw.slots) ? raw.slots : [];
  const [rawSlot1, rawSlot2] = orderSlots(slots);
  const slot1 = normalizeSetSlot(rawSlot1);
  const slot2 = normalizeSetSlot(rawSlot2);
  const stateRaw = num(raw.state);
  return {
    id: raw.id,
    identifier: str(raw.identifier),
    round: str(raw.fullRoundText),
    roundNumber: num(raw.round),
    state: setStateName(stateRaw),
    stateRaw,
    startedAt: toIso(num(raw.startedAt)),
    completedAt: toIso(num(raw.completedAt)),
    entrant1: slot1,
    entrant2: slot2,
    score: {
      entrant1: slot1?.score ?? null,
      entrant2: slot2?.score ?? null,
      displayScore: str(raw.displayScore),
    },
    winnerEntrantId: num(raw.winnerId),
    totalGames: num(raw.totalGames),
    phase: raw.phaseGroup?.phase?.id
      ? { id: raw.phaseGroup.phase.id, name: str(raw.phaseGroup.phase.name) }
      : null,
    phaseGroup: raw.phaseGroup?.id
      ? { id: raw.phaseGroup.id, displayIdentifier: str(raw.phaseGroup.displayIdentifier) }
      : null,
    vodUrl: str(raw.vodUrl),
    ...(raw.event !== undefined
      ? {
          event:
            raw.event && raw.event.id != null
              ? {
                  id: raw.event.id,
                  name: str(raw.event.name),
                  slug: str(raw.event.slug),
                  tournament:
                    raw.event.tournament && raw.event.tournament.id != null
                      ? {
                          id: raw.event.tournament.id,
                          name: str(raw.event.tournament.name),
                          slug: str(raw.event.tournament.slug),
                        }
                      : null,
                }
              : null,
        }
      : {}),
  };
}

export function normalizeStream(raw: any): NormalizedStream | null {
  if (!raw) return null;
  const source = str(raw.streamSource);
  const name = str(raw.streamName);
  return {
    id: num(raw.id),
    source,
    name,
    game: str(raw.streamGame),
    status: str(raw.streamStatus),
    isOnline: bool(raw.isOnline),
    enabled: bool(raw.enabled),
    derivedUrl: deriveStreamUrl(source, name),
  };
}

export function deriveStreamUrl(source: string | null, name: string | null): string | null {
  if (!source || !name) return null;
  if (source === "TWITCH") return `https://www.twitch.tv/${encodeURIComponent(name)}`;
  // YOUTUBE streamName is a display name (often not a channel handle), and the
  // remaining sources are defunct; deriving a URL would be guesswork.
  return null;
}

export function normalizeStreamQueue(raw: any): NormalizedStreamQueue | null {
  if (!raw) return null;
  return {
    id: str(raw.id),
    stream: normalizeStream(raw.stream),
    sets: Array.isArray(raw.sets)
      ? raw.sets
          .map(normalizeSet)
          .filter((s: NormalizedSet | null): s is NormalizedSet => s !== null)
      : [],
  };
}

export interface NormalizedParticipant {
  participantId: number;
  gamerTag: string | null;
  prefix: string | null;
  playerId: number | null;
  userId: number | null;
  userSlug: string | null;
}

export function normalizeParticipant(raw: any): NormalizedParticipant | null {
  if (!raw || raw.id == null) return null;
  return {
    participantId: raw.id,
    gamerTag: str(raw.gamerTag),
    prefix: str(raw.prefix),
    playerId: num(raw.player?.id),
    userId: num(raw.user?.id),
    userSlug: str(raw.user?.slug),
  };
}

export function normalizePlayer(raw: any): NormalizedPlayer | null {
  if (!raw || raw.id == null) return null;
  return {
    playerId: raw.id,
    gamerTag: str(raw.gamerTag),
    prefix: str(raw.prefix),
    user:
      raw.user && raw.user.id != null
        ? { id: raw.user.id, slug: str(raw.user.slug), name: str(raw.user.name) }
        : null,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
