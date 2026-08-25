import { describe, expect, it } from "vitest";
import { composeEventSlug, parseStartggUrl, toTournamentSlug } from "../src/startgg/url.js";
import { StartggError } from "../src/startgg/errors.js";

describe("parseStartggUrl", () => {
  it("parses a full event URL", () => {
    expect(
      parseStartggUrl("https://www.start.gg/tournament/genesis-9/event/ultimate-singles"),
    ).toEqual({ type: "event", tournamentSlug: "genesis-9", eventSlug: "ultimate-singles" });
  });

  it("parses a tournament URL with trailing tabs", () => {
    expect(parseStartggUrl("https://start.gg/tournament/genesis-9/details")).toEqual({
      type: "tournament",
      tournamentSlug: "genesis-9",
    });
  });

  it("parses an event URL with extra path segments", () => {
    expect(
      parseStartggUrl(
        "https://www.start.gg/tournament/genesis-9/event/ultimate-singles/brackets/12345",
      ),
    ).toEqual({ type: "event", tournamentSlug: "genesis-9", eventSlug: "ultimate-singles" });
  });

  it("accepts legacy smash.gg hosts", () => {
    expect(parseStartggUrl("https://smash.gg/tournament/evo-2019/event/smash-ultimate")).toEqual({
      type: "event",
      tournamentSlug: "evo-2019",
      eventSlug: "smash-ultimate",
    });
  });

  it("accepts bare paths and slugs", () => {
    expect(parseStartggUrl("tournament/genesis-9/event/ultimate-singles").type).toBe("event");
    expect(parseStartggUrl("tournament/genesis-9")).toEqual({
      type: "tournament",
      tournamentSlug: "genesis-9",
    });
    expect(parseStartggUrl("genesis-9")).toEqual({
      type: "tournament",
      tournamentSlug: "genesis-9",
    });
  });

  it("rejects non-start.gg hosts", () => {
    expect(() => parseStartggUrl("https://example.com/tournament/foo")).toThrowError(StartggError);
  });

  it("rejects unsupported paths, empty input, and broken slugs", () => {
    expect(() => parseStartggUrl("https://www.start.gg/user/abc123/details")).toThrow();
    expect(() => parseStartggUrl("   ")).toThrow();
    expect(() => parseStartggUrl("https://www.start.gg/tournament/")).toThrow();
    expect(() => parseStartggUrl("tournament/genesis-9/event/")).toThrow();
    expect(() => parseStartggUrl("ftp://start.gg/tournament/foo")).toThrow();
  });

  it("reports INVALID_INPUT as the error code", () => {
    try {
      parseStartggUrl("https://example.com/x");
      expect.unreachable();
    } catch (e) {
      expect((e as StartggError).code).toBe("INVALID_INPUT");
    }
  });
});

describe("slug helpers", () => {
  it("toTournamentSlug strips prefixes and URLs", () => {
    expect(toTournamentSlug("genesis-9")).toBe("genesis-9");
    expect(toTournamentSlug("tournament/genesis-9")).toBe("genesis-9");
    expect(toTournamentSlug("https://www.start.gg/tournament/genesis-9")).toBe("genesis-9");
  });

  it("composeEventSlug builds the API slug form", () => {
    expect(composeEventSlug("genesis-9", "ultimate-singles")).toBe(
      "tournament/genesis-9/event/ultimate-singles",
    );
  });
});
