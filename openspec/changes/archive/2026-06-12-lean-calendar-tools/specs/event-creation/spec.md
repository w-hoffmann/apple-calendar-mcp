## ADDED Requirements

### Requirement: Create recurring events

The `create_event` tool SHALL support an optional `recurrence` parameter that
creates a repeating event in a single call, mapped to an `EKRecurrenceRule` in
the Swift layer. The parameter SHALL accept a `frequency`
(`daily`/`weekly`/`monthly`/`yearly`), an optional `interval` (a positive
integer, default 1), an optional recurrence end expressed as either an `endDate`
(ISO8601) or an `occurrenceCount` (a positive integer) but not both, and an
optional `daysOfWeek` (weekday codes `MO`/`TU`/`WE`/`TH`/`FR`/`SA`/`SU`) that
applies to `weekly` recurrence only and SHALL be rejected for other frequencies.
When `recurrence` is omitted, the tool SHALL create a single non-recurring event
exactly as before. The created event SHALL be returned in the lean payload shape
defined by the `tool-conventions` capability.

#### Scenario: Each frequency maps to its recurrence rule

- **WHEN** `create_event` is invoked with a `recurrence` whose `frequency` is
  `daily`, `weekly`, `monthly`, or `yearly`
- **THEN** the system creates a recurring event repeating at that frequency
- **AND** returns the created event with `hasRecurrenceRules` true

#### Scenario: Interval is honored

- **WHEN** `create_event` is invoked with a `recurrence` `frequency` of `weekly`
  and `interval` of 2
- **THEN** the created series repeats every two weeks

#### Scenario: Days of week constrain weekly recurrence

- **WHEN** `create_event` is invoked with `frequency` `weekly` and a `daysOfWeek`
  list
- **THEN** the created series repeats only on those weekdays

#### Scenario: daysOfWeek is rejected for non-weekly frequencies

- **WHEN** `create_event` is invoked with a non-`weekly` `frequency` and a
  `daysOfWeek` list
- **THEN** the system returns a tool result flagged as an error
- **AND** no event is created

#### Scenario: Non-positive interval is rejected

- **WHEN** `create_event` is invoked with a `recurrence` `interval` of zero or a
  negative number
- **THEN** the system returns a tool result flagged as an error
- **AND** no event is created

#### Scenario: Recurrence bounded by end date

- **WHEN** `create_event` is invoked with a `recurrence` that includes an
  `endDate`
- **THEN** the created series stops recurring after that date

#### Scenario: Recurrence bounded by occurrence count

- **WHEN** `create_event` is invoked with a `recurrence` that includes an
  `occurrenceCount`
- **THEN** the created series produces exactly that many occurrences

#### Scenario: endDate and occurrenceCount together are rejected

- **WHEN** `create_event` is invoked with a `recurrence` that includes both an
  `endDate` and an `occurrenceCount`
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text indicates that only one recurrence end may be given
- **AND** no event is created

#### Scenario: Invalid recurrence frequency is rejected

- **WHEN** `create_event` is invoked with a `recurrence` whose `frequency` is not
  one of `daily`/`weekly`/`monthly`/`yearly`
- **THEN** the system returns a tool result flagged as an error
- **AND** no event is created

#### Scenario: Omitting recurrence creates a single event

- **WHEN** `create_event` is invoked without a `recurrence` parameter
- **THEN** a single non-recurring event is created
- **AND** the returned event has `hasRecurrenceRules` false

### Requirement: Describe creation inputs to clients

The `create_event` tool description SHALL state that `calendarId` is obtained
from `get_calendars` and that `startDate`/`endDate` are ISO8601, so a client can
form a valid call without guessing input formats or ID sources.

#### Scenario: Tool advertises calendarId source and date format

- **WHEN** the `create_event` tool is described to a client
- **THEN** the description states that `calendarId` comes from `get_calendars`
- **AND** the description states that `startDate`/`endDate` are ISO8601
