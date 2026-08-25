import { describe, expect, it } from "vitest";
import { TtlCache } from "../src/startgg/cache.js";

describe("TtlCache", () => {
  it("returns cached values before the TTL and drops them after", () => {
    let t = 0;
    const cache = new TtlCache({ now: () => t });
    cache.set("k", { a: 1 }, 1000);
    expect(cache.get("k")).toEqual({ a: 1 });
    t = 999;
    expect(cache.get("k")).toEqual({ a: 1 });
    t = 1000;
    expect(cache.get("k")).toBeUndefined();
  });

  it("ignores set with a non-positive TTL", () => {
    const cache = new TtlCache();
    cache.set("k", 1, 0);
    expect(cache.get("k")).toBeUndefined();
  });

  it("evicts the least recently used entry beyond maxEntries", () => {
    const t = 0;
    const cache = new TtlCache({ maxEntries: 2, now: () => t });
    cache.set("a", 1, 10_000);
    cache.set("b", 2, 10_000);
    cache.get("a"); // refresh recency of "a"
    cache.set("c", 3, 10_000); // evicts "b"
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
  });

  it("overwrites existing keys", () => {
    const cache = new TtlCache();
    cache.set("k", 1, 10_000);
    cache.set("k", 2, 10_000);
    expect(cache.get("k")).toBe(2);
    expect(cache.size).toBe(1);
  });
});
