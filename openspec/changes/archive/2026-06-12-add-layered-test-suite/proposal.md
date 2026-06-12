# Add Layered Test Suite

## Why

The Swift layer (679 LOC across CalendarService, Models, main.swift) has zero
tests, and the TypeScript bridge's execution paths (JSON parsing, timeouts,
exit codes) are untested — regressions in the riskiest code (recurring-event
slot matching, envelope parsing) can only be caught by manually running the
CLI against the real calendar. A layered, CI-safe test suite closes these gaps
without ever touching the user's real calendar data.

## What Changes

- Add contract tests for `src/bridge/swift.ts` against a fake `apple-bridge`
  stub (golden JSON envelopes, malformed output, exit codes, oversized output,
  timeout), injected via `APPLE_BRIDGE_BIN`.
- Add in-process MCP integration tests using
  `InMemoryTransport.createLinkedPair()` from `@modelcontextprotocol/sdk`: a
  real MCP `Client` exercises all 6 registered tools end-to-end against a
  faked bridge.
- Extract testable Swift logic (Models, validation, recurring-event slot
  matching) from the executable into a library target `AppleBridgeCore`; add a
  Swift Testing (`@Test`/`#expect`) test target. Slot matching is split into a
  pure function over a value struct plus a thin EventKit→struct mapping shim,
  so the risky logic needs no EventKit objects.
- Add an opt-in local E2E suite that creates its own marker-named test
  calendar, writes only there, and deletes it on teardown; gated behind
  `E2E_CALENDAR_TESTS=1`, skips without Full Access, never runs in CI.
- Wire the new CI-safe layers into `npm test` / `swift test` and
  `.github/workflows/ci.yml`.

## Capabilities

### New Capabilities

- `automated-testing`: CI-safe test layers — bridge contract tests via fake
  binary, in-process MCP integration tests, Swift unit tests via the extracted
  `AppleBridgeCore` library target. None of these require calendar access.
- `e2e-calendar-testing`: opt-in local end-to-end suite against a
  self-created, self-deleted marker calendar with strict safety guards
  (env-gated, marker-name assertion before every write, skip without access).

### Modified Capabilities

<!-- No requirement changes to the 6 registered MCP tools. The bridge CLI
     gains hidden `test-calendar` subcommands (not MCP tools, not in --help)
     and `SwiftBridge` gains one defaulted constructor option; both are
     additive and test-only, and the Swift library extraction is a pure
     refactor — so no existing capability spec changes. -->

## Impact

- **TypeScript**: new test files under `test/`; small fake-binary fixture
  (`test/fixtures/fake-bridge.mjs`); one additive production change in `src/` —
  a defaulted `SwiftBridge({ timeoutMs?, maxBuffer? })` constructor option for
  fast timeout/oversized tests (no behavior change at defaults). The
  `APPLE_BRIDGE_BIN` injection seam already exists.
- **Swift**: `swift/Package.swift` gains a library target `AppleBridgeCore`
  and a `.testTarget` (manifest stays `swift-tools-version: 5.9`);
  `CalendarService.swift`/`Models.swift`/`main.swift` are reorganized (logic
  moves, behavior unchanged); slot matching becomes a pure function plus a thin
  EventKit→struct shim. The bridge CLI gains hidden `test-calendar`
  subcommands for E2E (not exposed via MCP).
- **CI**: `.github/workflows/ci.yml` additionally runs `swift test`; vitest
  runs the `unit` project. E2E (`e2e` project) is never invoked in CI.
- **Dependencies**: none added at runtime; `@modelcontextprotocol/sdk` is
  already a dependency (InMemoryTransport ships with it); Swift Testing needs
  no package dependency but requires the Xcode 16+ toolchain on CI and dev
  machines (no manifest bump).
