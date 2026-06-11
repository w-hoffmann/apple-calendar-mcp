# Calendar Listing Specification

## Purpose

Expose the user's macOS calendars to MCP clients so that subsequent event
operations can target a calendar by its stable identifier. Backed by the
`get_calendars` MCP tool, which calls the `apple-bridge calendars` subcommand.

## Requirements

### Requirement: List all calendars

The system SHALL return every calendar known to the macOS EventKit store via the
`get_calendars` tool.

#### Scenario: Calendars are returned

- **WHEN** the `get_calendars` tool is invoked
- **THEN** the system returns a JSON array of calendars
- **AND** each calendar includes `id`, `title`, `type`, `source`, `color`, and
  `isImmutable`

#### Scenario: Calendar identifiers are usable for event operations

- **WHEN** a calendar `id` is read from the `get_calendars` result
- **THEN** that `id` is accepted as the `calendarId` argument of `create_event`
  and `update_event`

### Requirement: Surface calendar access failures

The system SHALL propagate errors (such as denied calendar access) instead of
returning an empty or misleading list.

#### Scenario: Calendar access is denied

- **WHEN** the `get_calendars` tool is invoked and EventKit access is not granted
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text describes the failure
