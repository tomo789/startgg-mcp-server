#!/usr/bin/env node
/**
 * Packaged-tarball smoke test. Run AFTER installing the `npm pack` tarball
 * into a clean directory:
 *
 *   node scripts/pack-smoke.mjs <installedPackageRoot> <binPath>
 *
 * e.g. node scripts/pack-smoke.mjs /tmp/pkgtest/node_modules/startgg-mcp-server \
 *        /tmp/pkgtest/node_modules/.bin/startgg-mcp-server
 *
 * Verifies (1) the tarball ships everything the server needs at runtime and
 * (2) the installed bin (an npm symlink/shim, the exact path that broke in
 * issue #1) starts and answers listTools with 16 tools — no token required.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [pkgRoot, binPath] = process.argv.slice(2);
if (!pkgRoot || !binPath) {
  console.error("usage: node scripts/pack-smoke.mjs <installedPackageRoot> <binPath>");
  process.exit(1);
}

let failures = 0;
function report(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
}

// 1. required files made it into the package
for (const f of ["dist/cli.js", "dist/server.js", "README.md", "LICENSE", "server.json"]) {
  report(`ships ${f}`, existsSync(join(pkgRoot, f)));
}
const expectedGraphql = readdirSync(new URL("../graphql/", import.meta.url))
  .filter((f) => f.endsWith(".graphql"))
  .sort();
const shippedGraphql = existsSync(join(pkgRoot, "graphql"))
  ? readdirSync(join(pkgRoot, "graphql"))
      .filter((f) => f.endsWith(".graphql"))
      .sort()
  : [];
report(
  "ships graphql documents",
  expectedGraphql.length > 0 && JSON.stringify(shippedGraphql) === JSON.stringify(expectedGraphql),
  `${shippedGraphql.length}/${expectedGraphql.length}`,
);

// 2. the installed bin starts and serves tools (works without STARTGG_TOKEN)
const isWindows = process.platform === "win32";
const command = isWindows ? `${binPath}.cmd` : binPath;
const transport = new StdioClientTransport({
  command,
  args: [],
  env: { ...process.env, STARTGG_TOKEN: "" },
  stderr: "ignore",
});
const client = new Client({ name: "pack-smoke", version: "0.0.0" });
await client.connect(transport);
const { tools } = await client.listTools();
report("bin serves listTools", tools.length === 16, `${tools.length} tools`);
await client.close();

console.log(failures === 0 ? "\nPACK SMOKE OK" : `\nPACK SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
