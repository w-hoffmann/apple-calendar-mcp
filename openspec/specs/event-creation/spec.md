# Event Creation Specification

## Purpose

Let MCP clients create new calendar events in a chosen calendar. Backed by the
`create_event` MCP tool, which calls the `apple-bridge create-event` subcommand.

## Requirements

### Requirement: Create an event

The system SHALL create a new event in the specified calendar via the
`create_event` tool.

#### Scenario: Event is created with required fields

- **WHEN** `create_event` is invoked with `calendarId`, `title`, ISO8601
  `startDate`, and ISO8601 `endDate`
- **THEN** the system creates the event in the target calendar
- **AND** returns the created event including its assigned `id`

#### Scenario: Optional fields are applied

- **WHEN** `create_event` is invoked with any of `timeZone`, `allDay`,
  `location`, or `notes`
- **THEN** the created event reflects those values

### Requirement: Surface creation failures

The system SHALL propagate creation failures (invalid calendar, denied access,
malformed dates) instead of silently succeeding.

#### Scenario: Creation fails

- **WHEN** `create_event` is invoked and the bridge cannot create the event
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text describes the failure

### Requirement: Validate creation inputs

The `create_event` tool SHALL reject inputs that cannot form a valid event,
returning a clear, accurate error rather than silently ignoring the input,
succeeding, or emitting an opaque underlying error, and SHALL behave
consistently with `update_event`.

#### Scenario: Invalid time-zone identifier is rejected

- **WHEN** `create_event` is invoked with a `timeZone` that is not a valid
  identifier (e.g. `"Not/AZone"`)
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text identifies the time zone as the cause
- **AND** the error text does not claim the input was an invalid date

#### Scenario: Empty title is rejected

- **WHEN** `create_event` is invoked with `title` set to an empty string
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text indicates the title must not be empty

#### Scenario: Inverted time range is rejected

- **WHEN** `create_event` is invoked such that `startDate` is at or after
  `endDate`
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text indicates that start must be before end
- **AND** no event is created
