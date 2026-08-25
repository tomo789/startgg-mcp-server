import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SERVER_NAME, SERVER_VERSION } from "../src/server.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const serverJson = JSON.parse(readFileSync(new URL("../server.json", import.meta.url), "utf8"));
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));

describe("release metadata consistency", () => {
  it("keeps package.json, server.json, and SERVER_VERSION in sync", () => {
    expect(pkg.version).toBe(SERVER_VERSION);
    expect(serverJson.version).toBe(SERVER_VERSION);
    expect(serverJson.packages[0].version).toBe(SERVER_VERSION);
  });

  it("keeps registry names in sync", () => {
    expect(pkg.name).toBe(SERVER_NAME);
    expect(pkg.mcpName).toBe(serverJson.name);
    expect(serverJson.packages[0].identifier).toBe(pkg.name);
  });

  it("points the bin at the CLI entry, which is shipped via files", () => {
    expect(pkg.bin["startgg-mcp-server"]).toBe("dist/cli.js");
    expect(pkg.files).toContain("dist");
    expect(pkg.files).toContain("graphql");
    expect(pkg.scripts.prepack).toContain("build");
  });

  it("keeps package-lock.json in sync with the package.json bin map", () => {
    expect(lock.packages[""].bin).toEqual(pkg.bin);
  });

  it("keeps server.json within the registry description limit", () => {
    expect(serverJson.description.length).toBeLessThanOrEqual(100);
  });
});
