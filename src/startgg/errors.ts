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
  // Unknown exceptions may carry file paths, stack fragments, or other
  // internals in their message, so only a fixed generic message is exposed.
  return new StartggError(
    "INTERNAL_ERROR",
    "The MCP server hit an unexpected internal error. This is a bug in startgg-mcp-server; " +
      "please report it at https://github.com/tomo789/startgg-mcp-server/issues.",
  );
}
