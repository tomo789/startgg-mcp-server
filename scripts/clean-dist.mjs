#!/usr/bin/env node
/**
 * Removes dist/ before every build so stale output from an earlier compiler
 * layout (e.g. the pre-rootDir dist/src/** tree) can never survive into
 * `npm pack` and ship alongside the current build.
 *
 * Runs automatically via the `prebuild` npm lifecycle script.
 */
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(resolve(root, "dist"), { recursive: true, force: true });
