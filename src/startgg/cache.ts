/**
 * Small in-memory TTL cache with LRU-ish eviction (Map insertion order).
 * Values are cached per (query, variables) key by the client.
 */
export interface TtlCacheOptions {
  maxEntries?: number;
  now?: () => number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<V = unknown> {
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly map = new Map<string, Entry<V>>();

  constructor(opts: TtlCacheOptions = {}) {
    this.maxEntries = opts.maxEntries ?? 500;
    this.now = opts.now ?? Date.now;
  }

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh recency so hot keys survive eviction.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    if (ttlMs <= 0) return;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: this.now() + ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
