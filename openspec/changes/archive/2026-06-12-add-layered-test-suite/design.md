# Design: Layered Test Suite

## Context

Current coverage: vitest unit tests for tool schemas and CLI arg builders
(pure TS), `scripts/smoke.sh` (fail-before-save validation checks), CI runs
the TCC-free subset. Untested: the entire Swift layer (no test target in
`swift/Package.swift`), the execution paths of `src/bridge/swift.ts`
(execa, JSON parsing, timeout, exit codes), and the MCP protocol path.

Hard platform constraint: real EventKit access is impossible in CI —
GitHub macOS runners do not pre-grant `kTCCServiceCalendar` and SIP blocks
editing TCC.db. All CI layers must therefore work without calendar access;
real-calendar verification stays local and opt-in.

Safety constraint (project rule): automated tests must be read-only or
fail-before-save against the real calendar; anything that writes needs
explicit opt-in and must be sandboxed.

## Goals / Non-Goals

**Goals:**

- Cover the bridge execution paths, the MCP protocol path, and the Swift
  logic (validation, ISO8601, envelope, recurring slot matching) in CI
  without any calendar access.
- Provide an opt-in local E2E suite that can never touch pre-existing
  calendars.
- No change to runtime *behavior*. The only production-code change is one
  additive, fully-defaulted constructor option on `SwiftBridge` (injectable
  timeout / maxBuffer, see Decision 1); the Swift reorganization is a pure
  refactor.

**Non-Goals:**

- Coverage gates, performance/load tests, mock-LLM evals.
- Mocking `EKEventStore` behind a protocol (fragile, low value — see
  Decision 3).
- Testing EventKit itself; `smoke.sh` and the E2E suite remain the
  reality checks.

## Decisions

### 1. Bridge contract tests via fake binary

A Node script at `test/fixtures/fake-bridge.mjs` emits canned envelopes
selected by the `FAKE_BRIDGE_MODE` env var: `ok`, `error`,
`malformed-json`, `empty-stdout`, `nonzero-exit`, `oversized`, `hang` (for
the timeout path). Tests construct `SwiftBridge` with `APPLE_BRIDGE_BIN`
pointing at the fixture's absolute path; execa spawns it directly and the
fixture's `#!/usr/bin/env node` shebang runs it under node.

**Implementation note (supersedes the original plan):** the original design
proposed pointing `APPLE_BRIDGE_BIN` at `node` with the fixture path as an
argument (execa `node:true`) to dodge exec-bit fragility. That isn't reachable
without a second production change — `SwiftBridge.exec` runs `execa(binPath,
args)` and cannot prepend the script path. Instead the fixture is a
self-executable shebang script and the contract test calls `chmodSync(FIXTURE,
0o755)` in `beforeAll`, which guarantees the exec bit at test time regardless
of how the repo was checked out — eliminating the same fragility with no
second production change. Functionally equivalent; the only production change
remains the `SwiftBridge` options bag.

The `hang` and `oversized` modes need a fast, small limit, but the timeout
(`30_000` ms) and `maxBuffer` (10 MB) are currently hardcoded in
`SwiftBridge` (swift.ts:135,138). Rather than mock execa (which would test
the mock, not the real parse/timeout path), add **one additive, defaulted
constructor option** — `new SwiftBridge({ timeoutMs?, maxBuffer? })`
defaulting to today's `30_000` / 10 MB — and pass it through to execa. This
is the single production-code change in `src/`; it changes no behavior at
default values. Tests inject e.g. a 50 ms timeout and a 1 KB buffer so
`hang`/`oversized` run instantly.

*Alternative considered:* per-case fixture scripts — more files, no gain.
*Alternative rejected:* mocking execa — would test the mock, not envelope
parsing/timeout. *Honesty guard:* fixture envelopes are copied from real
`apple-bridge` output; `smoke.sh` remains the periodic real-binary check.

### 2. In-process MCP integration tests via `InMemoryTransport`

`InMemoryTransport.createLinkedPair()` from `@modelcontextprotocol/sdk`
(already a dependency) connects a real MCP `Client` to a real `McpServer`
with the existing tool registration. Two variants:

- **Tool-behavior tests** with a faked bridge object (fast, most cases).
- **Full-path tests** with a real `SwiftBridge` pointed at the fake binary
  — covers client → server → tool → execa → envelope parsing in one test.

*Alternative considered:* spawning `build/index.js` over stdio — slower,
flakier, and the consensus is it adds nothing over in-process + one real
smoke. Rejected.

### 3. Swift: extract `AppleBridgeCore` library, test with Swift Testing

`swift/Package.swift` gains a library target `AppleBridgeCore` holding
Models, pure validation (title/range/timezone/span), and the recurring
slot-matching logic. The executable keeps `main.swift` + the
EventKit-touching `CalendarService` shell. A `.testTarget` uses Swift
Testing (`@Test`/`#expect`).

Slot matching is split into two layers, because the current logic reads
`occurrenceDate`, `eventIdentifier`, `calendarItemExternalIdentifier` and
`hasRecurrenceRules` off `EKEvent` (CalendarService.swift:164-209):
(a) a **pure** matching function over a plain `StoredEvent` value struct
(those four fields), unit-tested with no EventKit; and (b) a thin provider
in `CalendarService` that maps `EKEvent` → `StoredEvent`. The pure function
is the riskiest logic and becomes fully testable; the provider is a small
untested shim. Characterization tests are written against current behavior
*before* the refactor to lock it in.

Toolchain: keep `swift-tools-version: 5.9` and the Swift 5 language mode.
Swift Testing does **not** require a manifest bump — it only needs the
Swift 6 / Xcode 16+ *toolchain* installed (it ships bundled, no package
dependency). Staying on the 5.9 manifest preserves the existing deployment
floor; bumping to 6.0 would be a separate, explicitly-motivated decision
(e.g. for strict-concurrency tooling), not something Swift Testing forces.

*Alternative considered:* a full `EventStoreProtocol` + in-memory
`EKEventStore` fake — rejected: `EKEvent` instances are fragile without a
store and the protocol would exist only for tests. The `StoredEvent` value
+ thin mapping shim is the minimal seam; pure functions beat a mock layer.

### 4. E2E: vitest suite + hidden `test-calendar` bridge subcommands

The E2E suite runs the full stack (MCP client → server → real binary →
EventKit) against a calendar it creates itself.

Calendar create/delete is not part of the 6 tools and must not become one.
Instead `apple-bridge` gets a hidden subcommand (`shouldDisplay: false`)
`test-calendar create|delete --name <name>` that **hard-refuses any name
not starting with the marker prefix `MCP-E2E-`** (enforced in Swift via a
pure, unit-tested predicate in `AppleBridgeCore`, not just in test code).
This reuses the existing binary's TCC grant — a separate helper binary
would need its own signing and a second TCC prompt.

EventKit specifics the implementation must get right: a new `EKCalendar`
needs an `EKSource`. Select a writable source (prefer the Local source,
else the first writable one; return an error if none exists) and set
`calendar.source` before saving. Persisting and removing must use
`store.saveCalendar(_, commit: true)` / `store.removeCalendar(_, commit:
true)`; with `commit: false` the calendar lives only in memory and the
teardown sweep can never see or remove it (it would leak).

Suite mechanics:

- Lives in `test/e2e/`. A single `vitest.config.ts` defines two
  `test.projects` (`unit`, `e2e`, both `extends: true`) — the vitest 3.2+
  idiom; `vitest.workspace` / separate config files are deprecated. Opt-in
  comes from the npm scripts selecting the project: `test` →
  `vitest run --project unit`, `test:e2e` → `vitest run --project e2e`.
  Defense in depth: the e2e suite additionally no-ops unless
  `E2E_CALENDAR_TESTS=1`.
- Skips (not fails) when calendar access is missing.
- Setup creates `MCP-E2E-<runId>`; every write asserts the target
  `calendarId` belongs to that calendar; teardown deletes it (events go
  with it). Leftover `MCP-E2E-*` calendars from crashed runs are cleaned
  up at setup.

### 5. CI

Add `swift test` to the existing macOS job. Vitest picks up contract and
integration suites automatically; the E2E config is never invoked in CI.

## Risks / Trade-offs

- [Slot-matching refactor changes behavior] → characterization tests from
  current behavior first; refactor only after they pass; `smoke.sh` +
  E2E as backstop.
- [Fake binary drifts from real envelope format] → fixtures copied from
  real output; `smoke.sh` stays in CI for the access-independent part;
  E2E exercises the real envelope.
- [Swift Testing needs the Xcode 16+ toolchain] → no manifest bump (stays
  `swift-tools-version: 5.9`); CI `macos-latest` already provides Xcode 16+
  / Swift 6. Document the toolchain minimum in CLAUDE.md (README already
  states Swift 5.9+).
- [Hidden subcommand could delete a user calendar] → marker-prefix check
  lives in Swift and refuses everything else; subcommand is not registered
  as an MCP tool; E2E remains opt-in via project selection + env var.
- [E2E leaves debris after a crash] → teardown in `afterAll` plus
  setup-time sweep of leftover `MCP-E2E-*` calendars.

## Open Questions

- None blocking. (Marker prefix `MCP-E2E-` and env var name
  `E2E_CALENDAR_TESTS` are proposals — trivially renameable during
  implementation.)
