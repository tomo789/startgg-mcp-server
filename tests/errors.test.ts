import { describe, expect, it } from "vitest";
import { StartggError, toStartggError } from "../src/startgg/errors.js";
import { wrapHandler } from "../src/tools/shared.js";

describe("toStartggError", () => {
  it("returns StartggError instances unchanged", () => {
    const original = new StartggError("NOT_FOUND", 'Tournament "x" was not found on start.gg.');
    expect(toStartggError(original)).toBe(original);
  });

  it("does not leak unknown Error messages", () => {
    const leaky = new Error("ENOENT: no such file C:/Users/someone/secret/token.txt");
    const mapped = toStartggError(leaky);
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.message).not.toContain("ENOENT");
    expect(mapped.message).not.toContain("token.txt");
    expect(mapped.message).not.toContain(leaky.message);
  });

  it("maps non-Error throws to the same fixed generic message", () => {
    const fromString = toStartggError("thrown string with a-secret-value");
    expect(fromString.code).toBe("INTERNAL_ERROR");
    expect(fromString.message).not.toContain("a-secret-value");
    expect(fromString.message).toBe(toStartggError(new Error("anything")).message);
  });
});

describe("wrapHandler", () => {
  it("keeps unexpected exception details out of the tool result", async () => {
    const handler = wrapHandler(async () => {
      throw new Error("internal detail: /home/user/.env exploded");
    });
    const result = await handler({});
    expect(result.isError).toBe(true);
    const text = result.content[0]!.text;
    expect(text).not.toContain("internal detail");
    expect(text).not.toContain("/home/user/.env");
    expect(JSON.parse(text).error).toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
