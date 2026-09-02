import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const CLI = resolve(import.meta.dirname, "../dist/cli.js");

/**
 * Regression test for the npm-bin startup bug: the built CLI must start even
 * when invoked through a differently-named symlink (which is exactly what npm
 * bin does on POSIX). Requires `npm run build` first; CI runs build before test.
 */
describe.skipIf(!existsSync(CLI))("built CLI via symlink", () => {
  it("starts and serves listTools through a renamed symlink, without a token", async (ctx) => {
    const dir = mkdtempSync(join(tmpdir(), "startgg-cli-smoke-"));
    const link = join(dir, "renamed-bin-entry.js");
    try {
      try {
        symlinkSync(CLI, link, "file");
      } catch (err) {
        // Windows without Developer Mode cannot create symlinks; CI (Linux) covers this.
        if (process.platform === "win32") {
          ctx.skip();
          return;
        }
        throw err;
      }
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [link],
        env: { PATH: process.env.PATH ?? "" }, // deliberately no STARTGG_TOKEN
        stderr: "ignore",
      });
      const client = new Client({ name: "cli-smoke", version: "0.0.0" });
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(16);
      await client.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe.skipIf(existsSync(CLI))("built CLI via symlink (skipped)", () => {
  it("is skipped because dist/cli.js is missing — run npm run build first", () => {
    expect(true).toBe(true);
  });
});
