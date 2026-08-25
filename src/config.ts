export interface Config {
  /** start.gg API token. Undefined when not configured — tools then fail with AUTH_ERROR. */
  token: string | undefined;
  enableWrites: boolean;
  /** Max requests per 60-second sliding window. start.gg allows 80; default leaves headroom. */
  rateLimitPerMinute: number;
  timeoutMs: number;
  cacheEnabled: boolean;
}

function readIntEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

/**
 * Read configuration exclusively from the given env object (defaults to
 * process.env). The API endpoint is intentionally NOT configurable via
 * environment: the token must only ever be sent to api.start.gg. Library
 * consumers can still inject `apiUrl`/`fetchFn` on StartggClient directly.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = env.STARTGG_TOKEN?.trim() || undefined;
  return {
    token,
    enableWrites: env.STARTGG_ENABLE_WRITES === "true",
    rateLimitPerMinute: readIntEnv(env, "STARTGG_RATE_LIMIT", 75, 1, 80),
    timeoutMs: readIntEnv(env, "STARTGG_TIMEOUT_MS", 30_000, 1_000, 300_000),
    cacheEnabled: env.STARTGG_CACHE !== "off",
  };
}
