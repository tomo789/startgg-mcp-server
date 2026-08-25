import { describe, expect, it } from "vitest";
import { StartggClient } from "../../src/startgg/client.js";

/**
 * Optional live-API smoke tests. Skipped unless both are set:
 *   STARTGG_INTEGRATION=1
 *   STARTGG_TOKEN=<token>
 * They make 2 real requests against api.start.gg.
 */
const enabled = process.env.STARTGG_INTEGRATION === "1" && !!process.env.STARTGG_TOKEN;

/* eslint-disable @typescript-eslint/no-explicit-any */

describe.runIf(enabled)("live start.gg API", () => {
  const client = new StartggClient({ token: process.env.STARTGG_TOKEN });

  it("finds Super Smash Bros. Ultimate by name", async () => {
    const data = await client.request<any>("SearchVideogames", {
      name: "Super Smash Bros. Ultimate",
      page: 1,
      perPage: 5,
    });
    const ids = data.videogames.nodes.map((n: { id: number }) => n.id);
    expect(ids).toContain(1386);
  });

  it("resolves a historical event slug", async () => {
    // A completed 2026 weekly verified to exist while writing these tests.
    const data = await client.request<any>("ResolveEvent", {
      slug: "tournament/baeverse-battles-70-5/event/baeverse-battles-70",
    });
    expect(data.event?.id).toBeTypeOf("number");
    expect(data.event?.tournament?.id).toBeTypeOf("number");
  });
});

describe.runIf(!enabled)("live start.gg API (skipped)", () => {
  it("is skipped without STARTGG_INTEGRATION=1 and STARTGG_TOKEN", () => {
    expect(true).toBe(true);
  });
});
