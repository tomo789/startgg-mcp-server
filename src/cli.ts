#!/usr/bin/env node
/**
 * Executable entry point (npm bin target). Always starts the server —
 * no "was I invoked directly?" heuristics, so it works through npm bin
 * symlinks and shims on every platform.
 */
import { runServer } from "./server.js";

runServer().catch((err) => {
  console.error("[startgg-mcp-server] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
