import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as s from "../src/schemas/common.js";

describe("input schemas", () => {
  it("caps perPage", () => {
    const schema = z.object({ perPage: s.perPage(40, 20) });
    expect(schema.safeParse({ perPage: 40 }).success).toBe(true);
    expect(schema.safeParse({ perPage: 41 }).success).toBe(false);
    expect(schema.safeParse({ perPage: 0 }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("rejects invalid pages and ids", () => {
    expect(s.page.safeParse(0).success).toBe(false);
    expect(s.page.safeParse(1.5).success).toBe(false);
    expect(s.positiveId.safeParse(-1).success).toBe(false);
    expect(s.positiveId.safeParse(1386).success).toBe(true);
  });

  it("validates country codes", () => {
    expect(s.countryCode.safeParse("JP").success).toBe(true);
    expect(s.countryCode.safeParse("JPN").success).toBe(false);
    expect(s.countryCode.safeParse("j").success).toBe(false);
  });

  it("accepts set states as names or integers and converts to ints", () => {
    expect(s.setStates.safeParse(["COMPLETED", 2]).success).toBe(true);
    expect(s.setStates.safeParse(["NOT_A_STATE"]).success).toBe(false);
    expect(s.setStates.safeParse([9]).success).toBe(false);
    expect(s.setStates.safeParse([]).success).toBe(false);
    expect(s.setStatesToInts(["COMPLETED", "ACTIVE", 7])).toEqual([3, 2, 7]);
  });

  it("rejects oversized url and slug inputs", () => {
    expect(s.urlArg.safeParse("x".repeat(501)).success).toBe(false);
    expect(s.slugArg.safeParse("").success).toBe(false);
  });
});
