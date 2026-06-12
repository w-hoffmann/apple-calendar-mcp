# availability Specification

## Purpose

Let MCP clients find free time within a date range, honoring a minimum slot
duration and optional working-hours and calendar constraints. Backed by the
`find_free_slots` MCP tool, computed in the TypeScript layer from the events
returned by the bridge (no dedicated Swift subcommand). Timed events count as
busy; all-day events do not. Day boundaries and working hours are interpreted in
the server's local timezone.

## Requirements

### Requirement: Find free time within a range

The system SHALL return the free time gaps within an explicit
`startDate`/`endDate` window via a `find_free_slots` tool, computed in the
TypeScript layer from the events already returned by the bridge (no new Swift
subcommand). A free slot is an interval within the window that is not covered by
any busy event. Timed (non-all-day) events SHALL count as busy; all-day events
SHALL NOT count as busy, since they do not block timed availability. Busy events
that straddle a window boundary SHALL be clipped to the window, and zero-length
events SHALL NOT block availability.

The tool SHALL accept an optional minimum slot duration `minDurationMinutes`
(default 30), an optional `workingHours` constraint (`{ start, end }` as `HH:MM`,
e.g. `{ start: "09:00", end: "17:00" }`), and an optional calendar filter
(`calendars` names and/or `calendarIds`); when any is omitted, no constraint of
that kind is applied. Day boundaries and working hours are interpreted in the
server's local timezone (there is no timezone parameter). Date arguments and
emitted slot timestamps follow the cross-cutting date contract of the
`tool-conventions` capability: a date-only window resolves to local midnight (so
the inverted window matches the events the bridge returns), and slot
`start`/`end` carry the server-local UTC offset.

#### Scenario: Free slots are returned

- **WHEN** `find_free_slots` is invoked with ISO8601 `startDate` and `endDate`
- **THEN** the system returns a JSON array of free slots
- **AND** each slot includes its `start` and `end`, serialized with the
  server-local UTC offset (an exact-UTC instant may render as `Z`)
- **AND** no returned slot overlaps a timed event in the window

#### Scenario: Overlapping events are merged before computing gaps

- **WHEN** the window contains timed events that overlap or touch each other
- **THEN** the busy intervals are merged so a single contiguous free gap is
  returned between blocks of busy time, not one gap per event

#### Scenario: Events straddling the window boundary are clipped

- **WHEN** a timed event starts before `startDate` or ends after `endDate`
- **THEN** only its portion inside the window is treated as busy
- **AND** time inside the window outside that portion is reported as free

#### Scenario: Minimum slot duration is honored

- **WHEN** `find_free_slots` is invoked with a minimum duration
- **THEN** only free slots at least that long are returned
- **AND** gaps shorter than the minimum are omitted

#### Scenario: All-day events do not block availability

- **WHEN** the window contains an all-day event and no timed events
- **THEN** the corresponding time is reported as free

#### Scenario: Working hours constrain the slots

- **WHEN** `find_free_slots` is invoked with a working-hours constraint
  (e.g. `{ start: "09:00", end: "17:00" }`)
- **THEN** returned slots fall only within those hours on each day of the window
- **AND** time outside working hours is never reported as free

#### Scenario: Only selected calendars count as busy

- **WHEN** `find_free_slots` is invoked with a calendar filter
- **THEN** only events from the matching calendars are treated as busy
- **AND** events from other calendars do not reduce the reported free time

#### Scenario: Fully booked window returns no slots

- **WHEN** the window is fully covered by busy events (within working hours, if
  given)
- **THEN** the system returns an empty array rather than an error

### Requirement: Surface availability failures

The system SHALL propagate failures from the underlying event read (denied
access, malformed dates, bridge timeout) instead of returning misleading
availability.

#### Scenario: Underlying read fails

- **WHEN** `find_free_slots` is invoked and the bridge returns an error or times
  out while reading events
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text describes the failure

