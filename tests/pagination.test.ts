import { describe, expect, it } from "vitest";
import { fetchAllPages, toEpochSeconds } from "../src/tools/shared.js";
import { StartggError } from "../src/startgg/errors.js";

function pagedConnection(totalNodes: number, perPage: number) {
  const totalPages = Math.ceil(totalNodes / perPage);
  return async (page: number) => {
    const start = (page - 1) * perPage;
    const nodes = Array.from(
      { length: Math.max(0, Math.min(perPage, totalNodes - start)) },
      (_, i) => start + i,
    );
    return {
      pageInfo: { page, perPage, total: totalNodes, totalPages },
      nodes,
    };
  };
}

describe("fetchAllPages", () => {
  it("fetches every page when under the cap", async () => {
    const { nodes, pageInfo } = await fetchAllPages(pagedConnection(25, 10), 10, 20);
    expect(nodes).toHaveLength(25);
    expect(pageInfo).toMatchObject({ fetchedPages: 3, totalPages: 3, truncated: false });
  });

  it("stops at the page cap and flags truncation", async () => {
    const { nodes, pageInfo } = await fetchAllPages(pagedConnection(100, 10), 10, 3);
    expect(nodes).toHaveLength(30);
    expect(pageInfo).toMatchObject({ fetchedPages: 3, totalPages: 10, truncated: true });
  });

  it("handles an empty first page", async () => {
    const { nodes, pageInfo } = await fetchAllPages(pagedConnection(0, 10), 10, 5);
    expect(nodes).toHaveLength(0);
    expect(pageInfo.truncated).toBe(false);
  });

  it("stops on an empty batch when totalPages is unknown", async () => {
    let calls = 0;
    const getPage = async (_page: number) => {
      calls++;
      return { pageInfo: {}, nodes: calls <= 2 ? [1, 2] : [] };
    };
    const { nodes } = await fetchAllPages(getPage, 2, 50);
    expect(nodes).toHaveLength(4);
    expect(calls).toBe(3); // two full pages + the empty one; no runaway loop
  });
});

describe("toEpochSeconds", () => {
  it("accepts epoch seconds and ISO strings", () => {
    expect(toEpochSeconds(1787554800, "x")).toBe(1787554800);
    expect(toEpochSeconds("2026-08-24T00:00:00Z", "x")).toBe(
      Math.floor(Date.parse("2026-08-24T00:00:00Z") / 1000),
    );
    expect(toEpochSeconds("2026-08-24", "x")).toBe(Math.floor(Date.parse("2026-08-24") / 1000));
  });

  it("rejects nonsense with INVALID_INPUT", () => {
    for (const bad of ["not a date", -5, Number.NaN]) {
      try {
        toEpochSeconds(bad as never, "afterDate");
        expect.unreachable();
      } catch (e) {
        expect((e as StartggError).code).toBe("INVALID_INPUT");
        expect((e as StartggError).message).toContain("afterDate");
      }
    }
  });
});
