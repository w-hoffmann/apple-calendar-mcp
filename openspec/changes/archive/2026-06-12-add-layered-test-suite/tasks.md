# Tasks: Add Layered Test Suite

## 1. Bridge contract tests (fake binary)

- [x] 1.0 Add an additive, defaulted options bag to the `SwiftBridge`
      constructor — `constructor(opts?: { timeoutMs?: number; maxBuffer?:
      number })` defaulting to the current `30_000` / 10 MB
      (swift.ts:135,138) — and pass both through to execa. Behavior is
      unchanged at defaults; this is the only `src/` production change.
      Existing callers (`src/index.ts`) keep working unchanged
- [x] 1.1 Create `test/fixtures/fake-bridge.mjs` emitting envelopes per
      `FAKE_BRIDGE_MODE`: `ok`, `error`, `malformed-json`, `nonzero-exit`,
      `oversized`, `hang`; copy the `ok`/`error` envelope shapes from real
      `apple-bridge` output. Invoke it robustly by setting `APPLE_BRIDGE_BIN`
      to `node` with the absolute fixture path as an argument (execa
      `node:true`) to avoid exec-bit/shebang fragility in CI
- [x] 1.2 Write `test/bridge-contract.test.ts` constructing `SwiftBridge`
      with `APPLE_BRIDGE_BIN` at the fixture; cover all six contract
      scenarios — parsed data, error message surfaced, malformed output,
      non-zero exit, timeout (`hang` mode + an injected ~50 ms `timeoutMs`),
      oversized output (`oversized` mode + an injected ~1 KB `maxBuffer`)
- [x] 1.3 Confirm the suite runs inside `npm test` with no calendar
      access (no TCC prompt, passes on a machine without the grant)

## 2. In-process MCP integration tests

- [x] 2.1 Write `test/mcp-integration.test.ts`: real `McpServer` with the
      existing tool registration and a faked bridge object, connected to a
      real `Client` via `InMemoryTransport.createLinkedPair()`
- [x] 2.2 Tests: tool list exposes all 6 tools with input schemas; a valid
      tool call round-trips and returns the shaped result; schema-invalid
      arguments yield an error result without invoking the bridge
- [x] 2.3 Full-path test: same linked pair but with a real `SwiftBridge`
      pointed at the fake binary; assert the result derives from the fake
      envelope

## 3. Swift library extraction + Swift Testing

- [x] 3.1 Restructure `swift/Package.swift` (keep
      `swift-tools-version: 5.9`): add library target `AppleBridgeCore` +
      test target `AppleBridgeCoreTests`, move `Models.swift` into the
      library, make the executable depend on it. Keep the `-sectcreate
      __TEXT __info_plist` linkerSettings + entitlements on the executable
      target only; remove the now-redundant `-parse-as-library` flag.
      Verify `./scripts/build.sh`, codesign, `apple-bridge doctor`, and
      `otool -s __TEXT __info_plist swift/.build/release/apple-bridge`
      (Info.plist still embedded → TCC intact)
- [x] 3.2 Swift Testing tests for Models: ISO8601 parsing/formatting
      (both formats, round-trip), `BridgeOutput` envelope JSON contract,
      `BridgeError` messages
- [x] 3.3 Extract pure validation into `AppleBridgeCore` (non-empty
      title, start<end / start≤end all-day, time-zone identifier, span
      values); make `CalendarService`/`main.swift` delegate to it; add
      tests for every rule
- [x] 3.4 Extract recurring slot matching into two layers: (a) a pure
      matching function in `AppleBridgeCore` over a `StoredEvent` value
      struct (`occurrenceDate`, `eventId`, `externalId`,
      `hasRecurrenceRules`), and (b) a thin provider in `CalendarService`
      mapping `EKEvent` → `StoredEvent`. First write characterization tests
      for the current behavior (occurrence matches requested slot, no
      match, multiple candidates, all-day edge), then refactor
      `CalendarService.updateEvent` to delegate to the pure function
- [x] 3.5 Verify the refactor end-to-end: full `./scripts/build.sh`,
      `swift test`, then `./scripts/smoke.sh` against the real binary
      (fail-before-save checks only)

## 4. Opt-in E2E suite

- [x] 4.1 Add hidden `test-calendar create|delete` subcommands to
      `apple-bridge` (`shouldDisplay: false`); marker-prefix check
      (`MCP-E2E-`) as a pure, unit-tested function in `AppleBridgeCore`;
      refusal returns an error envelope before any EventKit call. On
      create: select a writable `EKSource` (prefer Local, else first
      writable, else error), set `calendar.source`, and
      `saveCalendar(_, commit: true)`. On delete: `removeCalendar(_,
      commit: true)`. Unit-test the source-selection helper
- [x] 4.2 In a single `vitest.config.ts`, define `test.projects` `unit`
      and `e2e` (both `extends: true`; vitest 3.2+ idiom, no separate
      config file). Scripts: `test` → `vitest run --project unit`,
      `test:e2e` → `vitest run --project e2e`. The e2e suite additionally
      no-ops unless `E2E_CALENDAR_TESTS=1`
- [x] 4.3 E2E setup/teardown: probe access via `doctor` and skip (not
      fail) when missing; sweep leftover `MCP-E2E-*` calendars; create
      `MCP-E2E-<runId>`; delete it in `afterAll`
- [x] 4.4 E2E tests through the in-process MCP client + real binary:
      create, query, search, and update an event in the marker calendar;
      assert the target `calendarId` belongs to the marker calendar
      before every write
- [x] 4.5 Manual verification on the dev machine (access already
      granted): run `E2E_CALENDAR_TESTS=1 npm run test:e2e` twice; confirm
      green runs and that no `MCP-E2E-*` calendar remains afterwards

## 5. CI & docs

- [x] 5.1 Add a `swift test` step to `.github/workflows/ci.yml`; confirm
      the runner (`macos-latest`) provides the Xcode 16+ / Swift 6
      toolchain Swift Testing needs (no manifest bump required)
- [x] 5.2 Verify CI never touches the E2E suite (config-level exclusion;
      no `test:e2e` invocation anywhere in the workflow)
- [x] 5.3 Update `CLAUDE.md` and `README` test sections: test layers,
      commands (`npm test`, `swift test`, `npm run test:e2e`), E2E opt-in
      rules and safety guarantees. Add a CLAUDE.md prerequisites note —
      Swift 5.9 manifest, but Swift Testing requires the Xcode 16+
      toolchain (README's "Swift 5.9+" stays correct)
