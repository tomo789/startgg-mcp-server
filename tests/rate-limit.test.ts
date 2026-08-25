import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/startgg/rate-limit.js";

function makeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    time: () => t,
  };
}

describe("RateLimiter", () => {
  it("allows maxRequests immediately within a window", async () => {
    const clock = makeClock();
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      now: clock.now,
      sleep: clock.sleep,
    });
    for (let i = 0; i < 5; i++) await limiter.acquire();
    expect(clock.time()).toBe(0);
  });

  it("delays the request that exceeds the window budget", async () => {
    const clock = makeClock();
    const limiter = new RateLimiter({
      maxRequests: 3,
      windowMs: 60_000,
      now: clock.now,
      sleep: clock.sleep,
    });
    for (let i = 0; i < 3; i++) await limiter.acquire();
    await limiter.acquire(); // must wait for the oldest slot to expire
    expect(clock.time()).toBeGreaterThanOrEqual(60_000);
  });

  it("frees slots as the window slides", async () => {
    const clock = makeClock();
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 1_000,
      now: clock.now,
      sleep: clock.sleep,
    });
    await limiter.acquire();
    await limiter.acquire();
    clock.advance(1_001); // both slots expired
    await limiter.acquire();
    expect(clock.time()).toBe(1_001); // no extra waiting
  });

  it("serves queued callers in FIFO order", async () => {
    const clock = makeClock();
    const limiter = new RateLimiter({
      maxRequests: 1,
      windowMs: 100,
      now: clock.now,
      sleep: clock.sleep,
    });
    const order: number[] = [];
    await Promise.all([
      limiter.acquire().then(() => order.push(1)),
      limiter.acquire().then(() => order.push(2)),
      limiter.acquire().then(() => order.push(3)),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });
});
