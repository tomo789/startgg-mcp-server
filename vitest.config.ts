import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests self-skip unless STARTGG_INTEGRATION=1 (see tests/integration/).
  },
});
