export type ErrorCode =
  | "AUTH_ERROR"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "STARTGG_GRAPHQL_ERROR"
  | "NETWORK_ERROR"
  | "INTERNAL_ERROR";

/**
 * The only error type surfaced to MCP clients. Messages must be written for an
 * LLM to act on, and must never contain the API token or stack traces.
 */
export class StartggError extends Error {
  readonly code: ErrorCode;
  /** Small, safe-to-expose extras (e.g. httpStatus). Never secrets. */
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "StartggError";
    this.code = code;
    this.details = details;
  }
}

export function authError(message?: string): StartggError {
  return new StartggError(
    "AUTH_ERROR",
    message ??
      "STARTGG_TOKEN is not configured or was rejected by start.gg. " +
        "Set the STARTGG_TOKEN environment variable (create a token at " +
        "https://start.gg/admin/profile/developer) and restart the MCP server.",
  );
}

export function notFound(what: string): StartggError {
  return new StartggError("NOT_FOUND", `${what} was not found on start.gg.`);
}

export function invalidInput(message: string): StartggError {
  return new StartggError("INVALID_INPUT", message);
}

/** Coerce any thrown value into a StartggError without leaking internals. */
export function toStartggError(err: unknown): StartggError {
  if (err instanceof StartggError) return err;
  if (err instanceof Error) {
    return new StartggError("INTERNAL_ERROR", `Unexpected error: ${err.message}`);
  }
  return new StartggError("INTERNAL_ERROR", "Unexpected non-Error value was thrown.");
}
