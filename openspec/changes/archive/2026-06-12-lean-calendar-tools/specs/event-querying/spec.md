## MODIFIED Requirements

### Requirement: Get events in a date range

The system SHALL return events whose occurrences fall within an explicit
`startDate`/`endDate` range via the `get_events` tool. Returned events SHALL use
the lean event payload shape defined by the `tool-conventions` capability.

#### Scenario: Events in range are returned

- **WHEN** `get_events` is invoked with ISO8601 `startDate` and `endDate`
- **THEN** the system returns a JSON array of events within that range
- **AND** each event includes `id`, `calendarId`, `calendarTitle`, `title`,
  `startDate`, `endDate`, `isAllDay`, and `hasRecurrenceRules`
- **AND** `occurrenceDate`, `timeZone`, `location`, and `notes` are included only
  when they have a value
- **AND** no event includes `isDetached` or `externalId`

#### Scenario: Recurring events are expanded into occurrences

- **WHEN** `get_events` covers a range containing a recurring series
- **THEN** the system returns one entry per occurrence in range
- **AND** each occurrence carries its `occurrenceDate`

#### Scenario: Filter by calendar

- **WHEN** `get_events` is invoked with `calendars` (names) and/or `calendarIds`
- **THEN** only events from the matching calendars are returned
- **AND** when both `calendars` and `calendarIds` are given, they combine as a
  union (an event is returned if it matches either), not one overriding the other

#### Scenario: Tool advertises recurring expansion and date semantics

- **WHEN** the `get_events` tool is described to a client
- **THEN** the description states that recurring events are expanded into
  individual occurrences
- **AND** the description states that `startDate`/`endDate` are ISO8601 and that
  an event's own time zone is reported in `timeZone` when set

## REMOVED Requirements

### Requirement: Get today's events

**Reason**: Redundant with `get_events` over a one-day range. The client already
knows the current date, so a dedicated tool only adds a tool definition to the
context without adding capability.

**Migration**: Call `get_events` with `startDate` at the start of the current
day and `endDate` at the start of the next day in local time. Construct each
boundary from the calendar day (e.g. `new Date(y, m, d)`), not by adding a fixed
24 h offset, so that DST transition days (a 23 h or 25 h local day) stay correct.
