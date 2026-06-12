# Automated Testing (Delta)

## ADDED Requirements

### Requirement: Bridge contract tests run without calendar access

The test suite SHALL verify the TypeScript bridge's handling of the CLI
contract — JSON envelope parsing, error propagation, exit codes, timeout,
and output limits — against a fake `apple-bridge` binary injected via
`APPLE_BRIDGE_BIN`, without requiring calendar access or TCC permission.

#### Scenario: Success envelope is parsed

- **WHEN** the fake binary emits a valid `{"status":"ok","data":...}`
  envelope
- **THEN** the bridge returns the parsed `data` payload

#### Scenario: Error envelope surfaces the message

- **WHEN** the fake binary emits `{"status":"error","error":"<message>"}`
- **THEN** the bridge fails with an error containing `<message>`

#### Scenario: Malformed output is rejected clearly

- **WHEN** the fake binary emits output that is not a valid JSON envelope
- **THEN** the bridge fails with an error identifying unparseable bridge
  output rather than throwing an opaque exception

#### Scenario: Non-zero exit is surfaced

- **WHEN** the fake binary exits with a non-zero status
- **THEN** the bridge fails with an error reflecting the failed invocation

#### Scenario: Hanging binary hits the timeout

- **WHEN** the fake binary never produces output
- **THEN** the bridge fails with a timeout error within its configured
  timeout

#### Scenario: Oversized output is capped

- **WHEN** the fake binary emits more output than the configured buffer
  limit
- **THEN** the bridge fails with an error instead of consuming unbounded
  memory

### Requirement: In-process MCP integration tests cover the protocol path

The test suite SHALL exercise the MCP server in-process via a linked
client/server transport pair (`InMemoryTransport`), verifying tool
discovery and tool invocation through the real protocol without spawning a
subprocess or requiring calendar access.

#### Scenario: All tools are discoverable

- **WHEN** a connected MCP client requests the tool list
- **THEN** all 6 registered tools are returned with their input schemas

#### Scenario: Tool call round-trips through the server

- **WHEN** a connected MCP client calls a tool with valid arguments against
  a faked bridge
- **THEN** the client receives the shaped tool result produced by the tool
  handler

#### Scenario: Invalid arguments are rejected via the protocol

- **WHEN** a connected MCP client calls a tool with arguments that violate
  the input schema
- **THEN** the client receives an error result and the bridge is not
  invoked

#### Scenario: Full path through a real bridge instance

- **WHEN** a connected MCP client calls a tool and the server uses a real
  `SwiftBridge` pointed at the fake binary
- **THEN** the client receives a result derived from the fake binary's
  envelope

### Requirement: Swift logic is unit-testable without EventKit

The Swift package SHALL provide a library target containing the models,
input validation, and recurring-event slot-matching logic, with a test
target (Swift Testing) that runs via `swift test` without calendar access.
The slot-matching decision SHALL be a pure function over plain value types
(a `StoredEvent` struct) so it requires no EventKit objects; mapping
`EKEvent` to those value types MAY remain a thin, untested shim outside
the library.

#### Scenario: ISO8601 parsing accepts both supported formats

- **WHEN** a date string with or without fractional seconds is parsed
- **THEN** parsing succeeds and round-trips to the expected instant

#### Scenario: Envelope encoding matches the CLI contract

- **WHEN** a success or error `BridgeOutput` is encoded
- **THEN** the JSON matches the `{"status":"ok","data":...}` /
  `{"status":"error","error":"..."}` contract

#### Scenario: Validation rules are enforced

- **WHEN** validation is invoked with an empty title, an inverted time
  range, an invalid time-zone identifier, or an invalid span value
- **THEN** each case is rejected with the matching `BridgeError`

#### Scenario: Recurring slot matching selects the correct occurrence

- **WHEN** slot matching runs against value-type occurrence data including
  edge cases (occurrence at the requested date, no match, multiple
  candidates)
- **THEN** it returns the occurrence matching the requested slot, and no
  match where none exists

#### Scenario: Refactor preserves current behavior

- **WHEN** the characterization tests written against pre-refactor
  behavior run on the extracted library
- **THEN** they pass unchanged

### Requirement: CI runs all automated layers without calendar access

The CI workflow SHALL run the TypeScript suites (unit, contract,
integration) and `swift test` on macOS without any calendar permission,
and SHALL NOT run the E2E suite.

#### Scenario: CI passes without TCC permission

- **WHEN** the CI workflow runs on a clean macOS runner
- **THEN** build, typecheck, vitest, and `swift test` all complete without
  a calendar access prompt or failure

#### Scenario: E2E is excluded from CI

- **WHEN** the CI workflow runs
- **THEN** no test in the E2E suite is executed
