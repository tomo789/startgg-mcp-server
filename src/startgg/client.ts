import { TtlCache } from "./cache.js";
import { StartggError, authError } from "./errors.js";
import { RateLimiter } from "./rate-limit.js";
import { loadOperation, type OperationName } from "./queries.js";

export interface StartggClientOptions {
  token: string | undefined;
  apiUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  cacheEnabled?: boolean;
  limiter?: RateLimiter;
  cache?: TtlCache;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Injectable jitter source for deterministic tests. Returns [0, 1). */
  random?: () => number;
}

export interface RequestOptions {
  /** Cache TTL for this request. 0 / undefined = no caching. */
  cacheTtlMs?: number;
}

interface GraphQLErrorShape {
  message?: string;
}

interface GraphQLResponse {
  data?: unknown;
  errors?: GraphQLErrorShape[];
  message?: string;
}

const RETRYABLE_HTTP = new Set([500, 502, 503, 504]);
const DEFAULT_API_URL = "https://api.start.gg/gql/alpha";

export class StartggClient {
  private readonly token: string | undefined;
  private readonly apiUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly cacheEnabled: boolean;
  private readonly limiter: RateLimiter;
  private readonly cache: TtlCache;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(opts: StartggClientOptions) {
    this.token = opts.token;
    this.apiUrl = opts.apiUrl ?? DEFAULT_API_URL;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.cacheEnabled = opts.cacheEnabled ?? true;
    this.limiter = opts.limiter ?? new RateLimiter({ maxRequests: 75, windowMs: 60_000 });
    this.cache = opts.cache ?? new TtlCache();
    this.fetchFn = opts.fetchFn ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = opts.random ?? Math.random;
  }

  /**
   * Execute a named operation and return the GraphQL `data` payload.
   * Throws StartggError for every failure mode; never leaks the token.
   */
  async request<T = unknown>(
    operation: OperationName,
    variables: Record<string, unknown> = {},
    options: RequestOptions = {},
  ): Promise<T> {
    if (!this.token) throw authError();

    const cacheKey = `${operation}:${JSON.stringify(variables)}`;
    const ttl = this.cacheEnabled ? (options.cacheTtlMs ?? 0) : 0;
    if (ttl > 0) {
      const hit = this.cache.get(cacheKey);
      if (hit !== undefined) return hit as T;
    }

    const query = loadOperation(operation);
    const body = JSON.stringify({ query, operationName: operation, variables });

    let lastError: StartggError | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await this.sleep(this.backoffMs(attempt, lastError));
      }
      await this.limiter.acquire();

      let response: Response;
      try {
        response = await this.fetchFn(this.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        lastError = networkError(err);
        continue; // network failures are retryable
      }

      if (response.status === 401 || response.status === 403) {
        discardBody(response);
        throw authError(
          `start.gg rejected the request (HTTP ${response.status}). ` +
            "The STARTGG_TOKEN is missing required permissions, expired, or invalid.",
        );
      }

      if (response.status === 429) {
        lastError = new StartggError(
          "RATE_LIMITED",
          "start.gg rate limit hit (max 80 requests per 60 seconds). Retried with backoff; " +
            "reduce request frequency or perPage/fetchAll usage.",
          { httpStatus: 429 },
        );
        lastError.details!.retryAfterMs = this.retryAfterMs(response);
        discardBody(response);
        continue;
      }

      if (RETRYABLE_HTTP.has(response.status)) {
        lastError = new StartggError(
          "NETWORK_ERROR",
          `start.gg returned a server error (HTTP ${response.status}).`,
          { httpStatus: response.status },
        );
        discardBody(response);
        continue;
      }

      let payload: GraphQLResponse;
      try {
        payload = (await response.json()) as GraphQLResponse;
      } catch {
        throw new StartggError(
          "NETWORK_ERROR",
          `start.gg returned a non-JSON response (HTTP ${response.status}).`,
          { httpStatus: response.status },
        );
      }

      if (payload.errors?.length) {
        // GraphQL-level errors (bad query, complexity limit, ...). Not retryable.
        const messages = payload.errors
          .map((e) => e.message ?? "unknown GraphQL error")
          .slice(0, 5);
        throw new StartggError(
          "STARTGG_GRAPHQL_ERROR",
          `start.gg GraphQL error: ${messages.join("; ")}`,
          { httpStatus: response.status },
        );
      }

      if (!response.ok || payload.data === undefined || payload.data === null) {
        throw new StartggError(
          "STARTGG_GRAPHQL_ERROR",
          `start.gg returned HTTP ${response.status} without usable data` +
            (payload.message ? `: ${payload.message}` : "."),
          { httpStatus: response.status },
        );
      }

      if (ttl > 0) this.cache.set(cacheKey, payload.data, ttl);
      return payload.data as T;
    }

    throw (
      lastError ?? new StartggError("INTERNAL_ERROR", "Request retry loop exited without a result.")
    );
  }

  private backoffMs(attempt: number, lastError: StartggError | undefined): number {
    const retryAfter = lastError?.details?.retryAfterMs;
    if (typeof retryAfter === "number" && retryAfter > 0) {
      return Math.min(retryAfter, 60_000);
    }
    // 1s, 2s, 4s ... plus up to 25% jitter.
    const base = 1000 * 2 ** (attempt - 1);
    return Math.min(base + base * 0.25 * this.random(), 30_000);
  }

  private retryAfterMs(response: Response): number | undefined {
    const header = response.headers.get("retry-after");
    if (!header) return undefined;
    const seconds = Number.parseInt(header, 10);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
    return undefined;
  }
}

function networkError(err: unknown): StartggError {
  const cause =
    err instanceof Error
      ? err.name === "TimeoutError"
        ? "request timed out"
        : err.message
      : "unknown error";
  return new StartggError("NETWORK_ERROR", `Could not reach start.gg: ${cause}`);
}

/** Release a response we will not read, so the socket returns to the pool. */
function discardBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}
