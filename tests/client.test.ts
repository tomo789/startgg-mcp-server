import { describe, expect, it } from "vitest";
import { StartggClient, type StartggClientOptions } from "../src/startgg/client.js";
import { StartggError } from "../src/startgg/errors.js";
import { RateLimiter } from "../src/startgg/rate-limit.js";
import { TtlCache } from "../src/startgg/cache.js";

const TOKEN = "secret-test-token-abc123";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function makeClient(
  responses: (() => Response | Error)[],
  overrides: Partial<StartggClientOptions> = {},
) {
  const calls: { body: string }[] = [];
  const sleeps: number[] = [];
  const fetchFn = (async (_url: unknown, init?: RequestInit) => {
    calls.push({ body: String(init?.body) });
    const next = responses.shift();
    if (!next) throw new Error("no scripted response left");
    const result = next();
    if (result instanceof Error) throw result;
    return result;
  }) as typeof fetch;

  const client = new StartggClient({
    token: TOKEN,
    fetchFn,
    limiter: new RateLimiter({
      maxRequests: 1000,
      windowMs: 60_000,
      sleep: async () => undefined,
    }),
    cache: new TtlCache(),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0,
    ...overrides,
  });
  return { client, calls, sleeps };
}

const OK_DATA = { videogames: { nodes: [] } };

describe("StartggClient", () => {
  it("returns GraphQL data on success", async () => {
    const { client, calls } = makeClient([() => jsonResponse({ data: OK_DATA })]);
    const data = await client.request("SearchVideogames", { name: "x" });
    expect(data).toEqual(OK_DATA);
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0]!.body);
    expect(body.operationName).toBe("SearchVideogames");
    expect(body.variables).toEqual({ name: "x" });
    expect(body.query).toContain("query SearchVideogames");
  });

  it("throws AUTH_ERROR without calling fetch when the token is missing", async () => {
    const { client, calls } = makeClient([], { token: undefined });
    await expect(client.request("SearchVideogames")).rejects.toMatchObject({
      code: "AUTH_ERROR",
    });
    expect(calls).toHaveLength(0);
  });

  it("throws AUTH_ERROR on 401 without retrying", async () => {
    const { client, calls } = makeClient([() => jsonResponse({}, 401)]);
    await expect(client.request("SearchVideogames")).rejects.toMatchObject({
      code: "AUTH_ERROR",
    });
    expect(calls).toHaveLength(1);
  });

  it("never leaks the token in error messages", async () => {
    const { client } = makeClient([() => jsonResponse({}, 401)]);
    const err = (await client.request("SearchVideogames").catch((e) => e)) as StartggError;
    expect(err.message).not.toContain(TOKEN);
    expect(JSON.stringify(err.details ?? {})).not.toContain(TOKEN);
  });

  it("retries 429 honoring Retry-After seconds", async () => {
    const { client, sleeps } = makeClient([
      () => jsonResponse({}, 429, { "Retry-After": "2" }),
      () => jsonResponse({ data: OK_DATA }),
    ]);
    const data = await client.request("SearchVideogames");
    expect(data).toEqual(OK_DATA);
    expect(sleeps).toEqual([2000]);
  });

  it("gives up with RATE_LIMITED after exhausting retries on 429", async () => {
    const { client, calls } = makeClient([
      () => jsonResponse({}, 429),
      () => jsonResponse({}, 429),
      () => jsonResponse({}, 429),
      () => jsonResponse({}, 429),
    ]);
    await expect(client.request("SearchVideogames")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(calls).toHaveLength(4); // initial + 3 retries
  });

  it("retries server errors with exponential backoff", async () => {
    const { client, sleeps } = makeClient([
      () => jsonResponse({}, 503),
      () => jsonResponse({}, 503),
      () => jsonResponse({ data: OK_DATA }),
    ]);
    const data = await client.request("SearchVideogames");
    expect(data).toEqual(OK_DATA);
    expect(sleeps).toEqual([1000, 2000]); // random() = 0 -> no jitter
  });

  it("retries network failures", async () => {
    const { client } = makeClient([
      () => new TypeError("fetch failed"),
      () => jsonResponse({ data: OK_DATA }),
    ]);
    await expect(client.request("SearchVideogames")).resolves.toEqual(OK_DATA);
  });

  it("does not retry GraphQL errors and reports their messages", async () => {
    const { client, calls } = makeClient([
      () =>
        jsonResponse({
          errors: [{ message: "Your query complexity is too high" }],
        }),
    ]);
    const err = (await client.request("SearchVideogames").catch((e) => e)) as StartggError;
    expect(err.code).toBe("STARTGG_GRAPHQL_ERROR");
    expect(err.message).toContain("complexity");
    expect(calls).toHaveLength(1);
  });

  it("maps non-JSON responses to NETWORK_ERROR", async () => {
    const { client } = makeClient([() => new Response("<html>gateway</html>", { status: 200 })]);
    await expect(client.request("SearchVideogames")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });

  it("serves repeated requests from cache when a TTL is set", async () => {
    const { client, calls } = makeClient([() => jsonResponse({ data: OK_DATA })]);
    await client.request("SearchVideogames", { name: "melee" }, { cacheTtlMs: 60_000 });
    await client.request("SearchVideogames", { name: "melee" }, { cacheTtlMs: 60_000 });
    expect(calls).toHaveLength(1);
  });

  it("does not cache when caching is disabled", async () => {
    const { client, calls } = makeClient(
      [() => jsonResponse({ data: OK_DATA }), () => jsonResponse({ data: OK_DATA })],
      { cacheEnabled: false },
    );
    await client.request("SearchVideogames", {}, { cacheTtlMs: 60_000 });
    await client.request("SearchVideogames", {}, { cacheTtlMs: 60_000 });
    expect(calls).toHaveLength(2);
  });
});
