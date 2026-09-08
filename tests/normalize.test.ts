import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deriveStreamUrl,
  normalizeEntrant,
  normalizeSet,
  normalizeStanding,
  normalizeStream,
  normalizeStreamQueue,
  normalizeTournament,
  setStateName,
  toIso,
} from "../src/startgg/normalize.js";

const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/completed-set.json", import.meta.url), "utf8"),
);
const setWithGames = JSON.parse(
  readFileSync(new URL("./fixtures/set-with-games.json", import.meta.url), "utf8"),
);

describe("normalizeSet", () => {
  it("normalizes a completed set into the documented shape", () => {
    const set = normalizeSet(fixtures.completedSet)!;
    expect(set).toMatchObject({
      id: 106877974,
      round: "Grand Final",
      roundNumber: 3,
      state: "COMPLETED",
      stateRaw: 3,
      winnerEntrantId: 24481002,
      score: { entrant1: 2, entrant2: 3, displayScore: "LittleMacMain 2 - RenSuø 3" },
      phase: { id: 1994001, name: "Bracket" },
      phaseGroup: { id: 2288997, displayIdentifier: "A" },
    });
    expect(set.startedAt).toBe(new Date(1787549991 * 1000).toISOString());
    expect(set.completedAt).toBe(new Date(1787551174 * 1000).toISOString());
    expect(set.entrant1).toEqual({
      entrantId: 24480092,
      name: "LittleMacMain",
      seed: 5,
      players: [{ playerId: 3655189, gamerTag: "LittleMacMain", prefix: "" }],
      score: 2,
    });
    expect(set.entrant2?.seed).toBe(2);
  });

  it("keeps string ids of preview (unstarted) sets and maps state 1 to CREATED", () => {
    const set = normalizeSet(fixtures.previewSet)!;
    expect(set.id).toBe("preview_3430499_2_0");
    expect(set.state).toBe("CREATED");
    expect(set.entrant1).toBeNull();
    expect(set.entrant2).toBeNull();
    expect(set.completedAt).toBeNull();
    expect(set.score).toEqual({ entrant1: null, entrant2: null, displayScore: null });
  });

  it("passes through -1 scores (start.gg's DQ marker)", () => {
    const set = normalizeSet(fixtures.dqSet)!;
    expect(set.score.entrant2).toBe(-1);
    expect(set.entrant2?.players[0]?.gamerTag).toBe("No Show");
  });

  it("assigns entrant1/entrant2 by slotIndex even when the array order is reversed", () => {
    const reversed = {
      ...fixtures.completedSet,
      slots: [...fixtures.completedSet.slots].reverse(),
    };
    const set = normalizeSet(reversed)!;
    expect(set.entrant1?.name).toBe("LittleMacMain"); // slotIndex 0
    expect(set.entrant2?.name).toBe("RenSuø"); // slotIndex 1
    expect(set.score).toMatchObject({ entrant1: 2, entrant2: 3 });
  });

  it("falls back to array order when slotIndex is missing", () => {
    const noIndex = {
      ...fixtures.completedSet,
      slots: fixtures.completedSet.slots.map((s: { slotIndex: number }) => ({
        ...s,
        slotIndex: null,
      })),
    };
    const set = normalizeSet(noIndex)!;
    expect(set.entrant1?.name).toBe("LittleMacMain");
    expect(set.entrant2?.name).toBe("RenSuø");
  });

  it("returns null for junk input", () => {
    expect(normalizeSet(null)).toBeNull();
    expect(normalizeSet({})).toBeNull();
  });

  it("normalizes games, selections, derivedCharacters, stream, and event from a reported set", () => {
    const set = normalizeSet(setWithGames.set)!;
    expect(set.games).toHaveLength(4);
    expect(set.games![0]!.stage?.name).toBe("Small Battlefield");
    expect(typeof set.games![0]!.winnerEntrantId).toBe("number");
    expect(set.games![0]!.selections).toHaveLength(2);
    expect(set.games![0]!.selections.map((s) => s.character?.name)).toEqual(
      expect.arrayContaining(["Kazuya", "Min Min"]),
    );
    expect(set.derivedCharacters).toHaveLength(2);
    expect(set.derivedCharacters![0]!.entrantId).toBe(set.entrant1!.entrantId);
    expect(set.derivedCharacters![1]!.entrantId).toBe(set.entrant2!.entrantId);
    for (const entry of set.derivedCharacters!) {
      expect(entry.characters.length).toBeGreaterThan(0);
      expect(new Set(entry.characters).size).toBe(entry.characters.length);
    }
    expect(set.stream).toBeNull();
    expect(typeof set.event?.tournament?.slug).toBe("string");
  });

  it("omits games and derivedCharacters when the raw payload has no games key", () => {
    const set = normalizeSet(fixtures.completedSet)!;
    expect(set).not.toHaveProperty("games");
    expect(set).not.toHaveProperty("derivedCharacters");
  });

  it("treats games: null as an empty list with empty derivedCharacters per slot", () => {
    const set = normalizeSet({ ...setWithGames.set, games: null })!;
    expect(set.games).toEqual([]);
    expect(set.derivedCharacters).toEqual([
      { entrantId: set.entrant1!.entrantId, characters: [] },
      { entrantId: set.entrant2!.entrantId, characters: [] },
    ]);
  });
});

describe("toIso", () => {
  it("returns null for an invalid Date and still converts epoch 0", () => {
    expect(toIso(1e20)).toBeNull();
    expect(toIso(0)).toBe("1970-01-01T00:00:00.000Z");
  });
});

describe("setStateName", () => {
  it("maps known states and passes unknown ones through as null", () => {
    expect(setStateName(1)).toBe("CREATED");
    expect(setStateName(2)).toBe("ACTIVE");
    expect(setStateName(3)).toBe("COMPLETED");
    expect(setStateName(5)).toBe("INVALID");
    expect(setStateName(99)).toBeNull();
    expect(setStateName(null)).toBeNull();
  });
});

describe("normalizeEntrant / normalizeStanding", () => {
  it("flattens entrant participants into players", () => {
    const entrant = normalizeEntrant(fixtures.completedSet.slots[0].entrant)!;
    expect(entrant).toEqual({
      entrantId: 24480092,
      name: "LittleMacMain",
      seed: 5,
      isDisqualified: false,
      players: [{ playerId: 3655189, gamerTag: "LittleMacMain", prefix: "" }],
    });
  });

  it("normalizes standings with nested entrants", () => {
    const standing = normalizeStanding({
      placement: 1,
      isFinal: true,
      entrant: fixtures.completedSet.slots[1].entrant,
    })!;
    expect(standing.placement).toBe(1);
    expect(standing.entrant?.name).toBe("RenSuø");
  });
});

describe("normalizeStream / deriveStreamUrl", () => {
  it("derives a URL for TWITCH only", () => {
    expect(deriveStreamUrl("TWITCH", "pixelbaraus")).toBe("https://www.twitch.tv/pixelbaraus");
    expect(deriveStreamUrl("YOUTUBE", "まえだくん")).toBeNull();
    expect(deriveStreamUrl("TWITCH", null)).toBeNull();
    expect(deriveStreamUrl(null, "x")).toBeNull();
  });

  it("normalizes a stream and a stream queue", () => {
    const stream = normalizeStream({
      id: 1407528,
      streamSource: "TWITCH",
      streamName: "pixelbaraus",
      isOnline: false,
    })!;
    expect(stream.derivedUrl).toBe("https://www.twitch.tv/pixelbaraus");
    expect(stream.source).toBe("TWITCH");

    const queue = normalizeStreamQueue({
      id: "q1",
      stream: { id: 1, streamSource: "TWITCH", streamName: "chan" },
      sets: [fixtures.completedSet, null],
    })!;
    expect(queue.stream?.derivedUrl).toBe("https://www.twitch.tv/chan");
    expect(queue.sets).toHaveLength(1);
  });
});

describe("normalizeTournament", () => {
  it("converts epochs to ISO and absolutizes relative URLs", () => {
    const t = normalizeTournament({
      id: 945962,
      name: "Test Weekly",
      slug: "tournament/test-weekly",
      startAt: 1787554800,
      url: "/tournament/test-weekly",
      isOnline: false,
    })!;
    expect(t.startAt).toBe(new Date(1787554800 * 1000).toISOString());
    expect(t.url).toBe("https://www.start.gg/tournament/test-weekly");
    expect(t.endAt).toBeNull();
    expect(t.numAttendees).toBeNull();
  });
});
