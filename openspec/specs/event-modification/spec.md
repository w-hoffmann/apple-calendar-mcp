# Event Modification Specification

## Purpose

Let MCP clients modify existing calendar events safely: reschedule, rename, move
between calendars, or edit details. Backed by the `update_event` MCP tool, which
calls the `apple-bridge update-event` subcommand.

Event deletion is currently out of scope: the MCP surface exposes no delete
tool, so rescheduling or editing is used instead of removal. A dedicated delete
capability may be added later as a separate change if a real need arises.

## Requirements

### Requirement: Update an existing event by ID

The system SHALL update the event identified by `eventId` via the `update_event`
tool and SHALL preserve that event's identity.

#### Scenario: Event is updated

- **WHEN** `update_event` is invoked with an `eventId` and one or more changed
  fields
- **THEN** the system applies the changes to that event
- **AND** returns the updated event
- **AND** the event's `id` is unchanged

#### Scenario: Existing invitations are preserved

- **WHEN** an event with attendees/invitations is updated
- **THEN** the existing invitations are preserved

### Requirement: Partial updates leave omitted fields untouched

The system SHALL change only the fields supplied to `update_event` and SHALL
leave omitted fields untouched.

#### Scenario: Only supplied fields change

- **WHEN** `update_event` is invoked with a subset of fields (e.g. only
  `startDate` and `endDate`)
- **THEN** only those fields are modified
- **AND** all other event fields retain their previous values

#### Scenario: All-day flag can be set or cleared explicitly

- **WHEN** `update_event` is invoked with `allDay: true`
- **THEN** the event is marked all-day
- **WHEN** `update_event` is invoked with `allDay: false`
- **THEN** the event is marked non-all-day

#### Scenario: Move event between calendars

- **WHEN** `update_event` is invoked with a `calendarId`
- **THEN** the event is moved to the calendar with that ID

### Requirement: Control the scope of recurring updates

The system SHALL support targeting a single occurrence or this-and-future
occurrences of a recurring series via the `span` and `occurrenceDate` arguments.
Targeting a recurring series SHALL require `occurrenceDate`: the system SHALL
reject a recurring-event update that omits `occurrenceDate` with a clear,
recoverable error rather than silently editing the series master or first
occurrence. `span: "future"` SHALL require `occurrenceDate`, enforced at the
bridge boundary as well as in the tool layer. `occurrenceDate` identifies the
target occurrence by its value from `get_events.occurrenceDate` (the
occurrence's original series slot), not the desired new start time; the system
SHALL select the occurrence whose `occurrenceDate` matches the supplied value.

#### Scenario: Update a single occurrence

- **WHEN** `update_event` is invoked with `span: "this"` (the default) and an
  `occurrenceDate`
- **THEN** only that occurrence of the series is changed

#### Scenario: Update this and future occurrences

- **WHEN** `update_event` is invoked with `span: "future"` and an
  `occurrenceDate`
- **THEN** that occurrence and all later occurrences are changed

#### Scenario: The occurrence identified by occurrenceDate is selected

- **WHEN** `update_event` targets a recurring series that has more than one
  occurrence resolvable within the same day window (e.g. a sub-daily series)
  with a valid `occurrenceDate`
- **THEN** the occurrence identified by `occurrenceDate` is the one modified
- **AND** other occurrences of the series are left untouched

#### Scenario: Recurring update without occurrenceDate is rejected

- **WHEN** `update_event` targets a recurring event and `occurrenceDate` is
  omitted
- **THEN** the system returns an error instead of applying the change
- **AND** no occurrence of the series is modified
- **AND** the error text instructs the caller to pass `occurrenceDate` set to
  the occurrence's value as returned by `get_events.occurrenceDate`

#### Scenario: span future without occurrenceDate is rejected

- **WHEN** `update_event` is invoked with `span: "future"` and no
  `occurrenceDate`
- **THEN** the system returns a validation error instead of applying the change
- **AND** the error text states that `occurrenceDate` is required for
  `span: "future"`
- **AND** this rejection holds whether the call arrives via the tool layer or
  directly via the bridge CLI

#### Scenario: occurrenceDate that matches no occurrence is rejected recoverably

- **WHEN** `update_event` targets a recurring event with an `occurrenceDate`
  that matches no occurrence of the series
- **THEN** the system returns an error instead of applying the change
- **AND** the error text instructs the caller to pass the exact value from
  `get_events.occurrenceDate`
- **AND** the error is distinct from a generic unknown-`eventId` failure

### Requirement: Surface update failures

The system SHALL propagate update failures (unknown `eventId`, denied access,
malformed input) instead of silently succeeding.

#### Scenario: Update fails

- **WHEN** `update_event` is invoked and the bridge cannot apply the change
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text describes the failure

### Requirement: Validate update inputs

The `update_event` tool SHALL reject inputs that cannot form a valid event,
returning a clear error rather than silently succeeding or emitting an opaque
underlying error.

#### Scenario: Empty title is rejected

- **WHEN** `update_event` is invoked with `title` set to an empty string
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text indicates the title must not be empty

#### Scenario: Inverted time range is rejected

- **WHEN** `update_event` is invoked such that the resulting `startDate` is at or
  after the resulting `endDate`
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text indicates that start must be before end
- **AND** the event is not modified

#### Scenario: Unrecognized recurrence span is rejected

- **WHEN** `update_event` is invoked with a `span` value other than `"this"` or
  `"future"`
- **THEN** the system returns a tool result flagged as an error
- **AND** the span is not coerced to a default value

#### Scenario: Conflicting all-day flags are rejected

- **WHEN** the bridge is invoked with both an all-day and a non-all-day flag for
  the same update
- **THEN** the system returns a tool result flagged as an error
- **AND** the flags are not silently resolved to a single value
