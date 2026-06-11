import { defineConfig } from "vitest/config";

// Tests run against the compiled output in build/ (see the "test" script,
// which builds first). This exercises the real shipped ESM artifact and
// avoids TS path-resolution friction.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Pin a non-UTC zone with a stable offset so the local-midnight regression
    // guard in getDefaultSearchWindow actually exercises the UTC-offset path.
    // On a UTC host (e.g. GitHub's macos runners) local midnight == UTC midnight,
    // which would silently hide a regressive UTC-midnight "simplification".
    env: { TZ: "America/New_York" },
  },
});
