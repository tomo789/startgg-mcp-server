/**
 * Sliding-window rate limiter.
 *
 * start.gg documents "no more than 80 requests per 60 seconds"; the default
 * budget stays below that. `acquire()` resolves when the caller may send one
 * request. Callers queue fairly (FIFO) via an internal promise chain.
 */
export interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private timestamps: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(opts: RateLimiterOptions) {
    this.maxRequests = opts.maxRequests;
    this.windowMs = opts.windowMs;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  /** Resolves when a request slot is available; records the slot as used. */
  acquire(): Promise<void> {
    const turn = this.queue.then(() => this.waitForSlot());
    // Keep the chain alive even if a caller's turn rejects (it never should).
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  private async waitForSlot(): Promise<void> {
    for (;;) {
      const cutoff = this.now() - this.windowMs;
      this.timestamps = this.timestamps.filter((t) => t > cutoff);
      if (this.timestamps.length < this.maxRequests) {
        this.timestamps.push(this.now());
        return;
      }
      const oldest = this.timestamps[0]!;
      const waitMs = Math.max(1, oldest + this.windowMs - this.now());
      await this.sleep(waitMs);
    }
  }
}
