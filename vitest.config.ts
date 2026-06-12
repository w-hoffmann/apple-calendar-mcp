import { defineConfig } from "vitest/config";

// Tests run against the compiled output in build/ (see the "test" script,
// which builds first). This exercises the real shipped ESM artifact and
// avoids TS path-resolution friction.
//
// Two projects (vitest 3.2+ `test.projects` idiom):
//   - unit: CI-safe layers (schema, arg-builder, bridge contract, MCP
//     integration). No calendar access. Run via `npm test`.
//   - e2e: opt-in, writes to a self-created marker calendar, needs Full
//     Calendar Access. Run only via `npm run test:e2e` with
//     E2E_CALENDAR_TESTS=1; never selected by `npm test` or CI.
export default defineConfig({
  test: {
    // Pin a non-UTC zone with a stable offset so the local-midnight regression
    // guard in getDefaultSearchWindow actually exercises the UTC-offset path.
    // On a UTC host (e.g. GitHub's macos runners) local midnight == UTC midnight,
    // which would silently hide a regressive UTC-midnight "simplification".
    env: { TZ: "America/New_York" },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/**/*.test.ts"],
          exclude: ["test/e2e/**"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          // Selecting this project is the first gate; the suite itself no-ops
          // unless E2E_CALENDAR_TESTS=1 (see test/e2e/calendar-e2e.test.ts).
          name: "e2e",
          include: ["test/e2e/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
