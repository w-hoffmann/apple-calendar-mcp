# Event Querying Specification

## Purpose

Let MCP clients read calendar events over a date range, for the current day, or
by a text search. Recurring events are expanded into individual occurrences so
that clients see real instances rather than a single rule. Backed by the
`get_events`, `get_today_events`, and `search_events` MCP tools.

## Requirements

### Requirement: Get events in a date range

The system SHALL return events whose occurrences fall within an explicit
`startDate`/`endDate` range via the `get_events` tool.

#### Scenario: Events in range are returned

- **WHEN** `get_events` is invoked with ISO8601 `startDate` and `endDate`
- **THEN** the system returns a JSON array of events within that range
- **AND** each event includes `id`, `calendarId`, `calendarTitle`, `title`,
  `startDate`, `endDate`, `isAllDay`, `hasRecurrenceRules`, `occurrenceDate`,
  `isDetached`, `location`, and `notes`

#### Scenario: Recurring events are expanded into occurrences

- **WHEN** `get_events` covers a range containing a recurring series
- **THEN** the system returns one entry per occurrence in range
- **AND** each occurrence carries its `occurrenceDate`

#### Scenario: Filter by calendar

- **WHEN** `get_events` is invoked with `calendars` (names) and/or `calendarIds`
- **THEN** only events from the matching calendars are returned

### Requirement: Get today's events

The system SHALL return all events for the current day via the
`get_today_events` tool without requiring date arguments.

#### Scenario: Today's events are returned

- **WHEN** `get_today_events` is invoked
- **THEN** the system returns a JSON array of events occurring today

### Requirement: Search events by text

The system SHALL search events by a text query via the `search_events` tool,
matching against event title, location, and notes.

#### Scenario: Matching events are returned

- **WHEN** `search_events` is invoked with a `query`
- **THEN** the system returns events whose `title`, `location`, or `notes`
  contain the query as a case-insensitive substring

#### Scenario: Default search window

- **WHEN** `search_events` is invoked without `startDate` or `endDate`
- **THEN** the search window defaults to the start of the current day through 30
  days from now

### Requirement: Surface query failures

The system SHALL propagate query failures rather than returning misleading data.

#### Scenario: Bridge reports an error

- **WHEN** a query tool is invoked and the bridge returns an error or times out
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text describes the failure
