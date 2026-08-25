import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadConfig", () => {
  it("uses defaults for an empty env", () => {
    const config = loadConfig({});
    expect(config).toEqual({
      token: undefined,
      enableWrites: false,
      rateLimitPerMinute: 75,
      timeoutMs: 30_000,
      cacheEnabled: true,
    });
  });

  it("reads every value from the passed env object", () => {
    const config = loadConfig({
      STARTGG_TOKEN: "  abc  ",
      STARTGG_ENABLE_WRITES: "true",
      STARTGG_RATE_LIMIT: "7",
      STARTGG_TIMEOUT_MS: "1234",
      STARTGG_CACHE: "off",
    });
    expect(config).toEqual({
      token: "abc",
      enableWrites: true,
      rateLimitPerMinute: 7,
      timeoutMs: 1234,
      cacheEnabled: false,
    });
  });

  it("ignores process.env when an env object is passed explicitly", () => {
    vi.stubEnv("STARTGG_RATE_LIMIT", "9");
    vi.stubEnv("STARTGG_TIMEOUT_MS", "9999");
    vi.stubEnv("STARTGG_TOKEN", "from-process-env");
    const config = loadConfig({ STARTGG_RATE_LIMIT: "12" });
    expect(config.rateLimitPerMinute).toBe(12);
    expect(config.timeoutMs).toBe(30_000); // default, not process.env's 9999
    expect(config.token).toBeUndefined();
  });

  it("defaults to process.env when no env is passed", () => {
    vi.stubEnv("STARTGG_RATE_LIMIT", "9");
    expect(loadConfig().rateLimitPerMinute).toBe(9);
  });

  it("clamps out-of-range and rejects non-numeric ints back to defaults", () => {
    expect(loadConfig({ STARTGG_RATE_LIMIT: "0" }).rateLimitPerMinute).toBe(75);
    expect(loadConfig({ STARTGG_RATE_LIMIT: "81" }).rateLimitPerMinute).toBe(75);
    expect(loadConfig({ STARTGG_RATE_LIMIT: "80" }).rateLimitPerMinute).toBe(80);
    expect(loadConfig({ STARTGG_RATE_LIMIT: "abc" }).rateLimitPerMinute).toBe(75);
    expect(loadConfig({ STARTGG_TIMEOUT_MS: "999" }).timeoutMs).toBe(30_000);
    expect(loadConfig({ STARTGG_TIMEOUT_MS: "300001" }).timeoutMs).toBe(30_000);
  });

  it("treats a whitespace-only token as unset", () => {
    expect(loadConfig({ STARTGG_TOKEN: "   " }).token).toBeUndefined();
  });

  it("only the literal string 'true' enables writes", () => {
    expect(loadConfig({ STARTGG_ENABLE_WRITES: "TRUE" }).enableWrites).toBe(false);
    expect(loadConfig({ STARTGG_ENABLE_WRITES: "1" }).enableWrites).toBe(false);
    expect(loadConfig({ STARTGG_ENABLE_WRITES: "true" }).enableWrites).toBe(true);
  });
});
