# E2E Calendar Testing Specification

## Purpose

Provide an opt-in, local end-to-end test layer that exercises the full stack
(MCP client → server → real `apple-bridge` binary → EventKit) against a
calendar it creates itself and removes on teardown, with strict safety guards
so pre-existing calendars are never touched and the suite never runs in CI.

## Requirements

### Requirement: E2E suite is strictly opt-in

The E2E suite SHALL run only when explicitly invoked via its dedicated
command (`npm run test:e2e`) with `E2E_CALENDAR_TESTS=1` set, and SHALL
never run as part of `npm test` or CI.

#### Scenario: Default test run excludes E2E

- **WHEN** `npm test` runs
- **THEN** no E2E test executes

#### Scenario: Env gate is enforced even on direct invocation

- **WHEN** the E2E config is invoked without `E2E_CALENDAR_TESTS=1`
- **THEN** the suite skips all tests instead of touching EventKit

#### Scenario: Missing calendar access skips, not fails

- **WHEN** the E2E suite runs without Full Calendar Access granted
- **THEN** tests are reported as skipped with a hint to grant access, and
  nothing fails

### Requirement: E2E writes only to a self-created marker calendar

The E2E suite SHALL create its own calendar whose name starts with the
marker prefix (`MCP-E2E-`), SHALL direct every write to that calendar, and
SHALL verify the target calendar before each write. Pre-existing calendars
and their events SHALL never be modified.

#### Scenario: Suite creates its own calendar

- **WHEN** the E2E suite starts
- **THEN** it creates a new calendar named with the marker prefix and a
  unique run identifier

#### Scenario: Writes are confined to the marker calendar

- **WHEN** an E2E test creates or updates an event
- **THEN** the target `calendarId` is asserted to belong to the marker
  calendar before the call is made

#### Scenario: Full stack is exercised

- **WHEN** the E2E suite runs with access granted
- **THEN** event creation, querying, search, and update flow through the
  MCP server and the real `apple-bridge` binary against the marker
  calendar

### Requirement: Teardown removes the marker calendar

The E2E suite SHALL delete its marker calendar (including its events) on
teardown, and SHALL sweep leftover marker calendars from previous crashed
runs during setup.

#### Scenario: Teardown cleans up

- **WHEN** the E2E suite finishes
- **THEN** the marker calendar created by the run no longer exists

#### Scenario: Crashed-run debris is swept

- **WHEN** the E2E suite starts and calendars matching the marker prefix
  exist from earlier runs
- **THEN** those calendars are deleted before tests run

### Requirement: Test-calendar helper subcommands enforce the marker prefix

The `apple-bridge` CLI SHALL provide hidden `test-calendar create` and
`test-calendar delete` subcommands that refuse, in Swift, any calendar
name not starting with the marker prefix. These subcommands SHALL NOT be
exposed as MCP tools and SHALL NOT appear in the CLI help output.

#### Scenario: Non-marker name is refused

- **WHEN** `test-calendar create` or `test-calendar delete` is invoked
  with a name not starting with `MCP-E2E-`
- **THEN** the command returns an error envelope and performs no EventKit
  operation

#### Scenario: Created calendar is committed to a writable source

- **WHEN** `test-calendar create` is invoked with a marker-prefixed name
- **THEN** the new calendar is assigned a writable source (Local preferred,
  else the first writable source) and persisted with a committing save, so
  it is visible to a later query and to teardown
- **AND** if no writable source exists, an error envelope is returned and
  no calendar is created

#### Scenario: Delete targets only the named marker calendar

- **WHEN** `test-calendar delete` is invoked with a marker-prefixed name
- **THEN** only the calendar with exactly that name is removed with a
  committing delete

#### Scenario: Hidden from help and MCP

- **WHEN** `apple-bridge --help` output and the MCP tool list are
  inspected
- **THEN** `test-calendar` appears in neither
