import { defineConfig } from "vitest/config";

// Tests run against the compiled output in build/ (see the "test" script,
// which builds first). This exercises the real shipped ESM artifact and
// avoids TS path-resolution friction.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
