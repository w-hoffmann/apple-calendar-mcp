# tool-conventions Specification

## Purpose

Cross-cutting presentation contract for every MCP tool: honest annotations
(`readOnlyHint`, and `destructiveHint` on writes) and human-readable titles so
clients can distinguish read tools from write tools, plus the canonical lean
event payload shape (compact JSON, null/empty optional fields omitted, no
`isDetached`/`externalId`) returned by all event-emitting tools. `externalId`
stays internal to the Swift layer's occurrence matching and is never exposed to
clients.

## Requirements

### Requirement: Tools advertise honest annotations and titles

Every registered MCP tool SHALL advertise a human-readable `title` and an
honest `readOnlyHint` annotation so clients can distinguish read tools from
write tools and apply confirmation friction accordingly. Read tools
(`get_calendars`, `get_events`, `search_events`, `find_free_slots`) SHALL set
`readOnlyHint: true`; write tools (`create_event`, `update_event`) SHALL set
`readOnlyHint: false`. `update_event` SHALL additionally set
`destructiveHint: true`, since it overwrites existing event state; `create_event`
SHALL set `destructiveHint: false` to advertise its additive nature explicitly.
(Per MCP spec 2025-11-25 `destructiveHint` defaults to `true` when `readOnlyHint`
is `false`, so an additive write must set it to `false` explicitly rather than
omit it — otherwise a spec-compliant client would treat `create_event` as
destructive.)

#### Scenario: Read tools are annotated read-only

- **WHEN** a client lists the tools
- **THEN** `get_calendars`, `get_events`, `search_events`, and `find_free_slots`
  each advertise `readOnlyHint: true`
- **AND** each advertises a non-empty human-readable `title`

#### Scenario: Write tools are annotated non-read-only

- **WHEN** a client lists the tools
- **THEN** `create_event` and `update_event` each advertise `readOnlyHint: false`
- **AND** each advertises a non-empty human-readable `title`

#### Scenario: The update tool is annotated destructive

- **WHEN** a client lists the tools
- **THEN** `update_event` advertises `destructiveHint: true`
- **AND** `create_event` advertises `destructiveHint: false` (explicitly, not omitted)

### Requirement: Event payloads are returned in a lean shape

Every tool that returns calendar events SHALL serialize them in a lean,
token-efficient shape: compact JSON without insignificant whitespace, with any
field whose value is null omitted entirely, and without the `isDetached` or
`externalId` fields, which are not actionable for a client. This requirement
covers every event-returning tool: `get_events`, `search_events`,
`create_event`, and `update_event`. Identity and operational fields (`id`,
`calendarId`, `calendarTitle`, `title`, `startDate`, `endDate`, `isAllDay`,
`hasRecurrenceRules`) SHALL always be present; `occurrenceDate`, `timeZone`,
`location`, and `notes` SHALL be present only when they have a value. Removing
`externalId` from the client-facing payload SHALL NOT affect the bridge's
internal occurrence matching.

#### Scenario: Output is compact

- **WHEN** any event-returning tool produces a result
- **THEN** the serialized JSON contains no pretty-printing indentation or
  insignificant whitespace

#### Scenario: Null fields are omitted

- **WHEN** an event has no `location`, `notes`, `timeZone`, or `occurrenceDate`
- **THEN** those fields are absent from the serialized event rather than present
  with a null value

#### Scenario: Identity and operational fields are always present

- **WHEN** any event-returning tool produces a result
- **THEN** every event includes `id`, `calendarId`, `calendarTitle`, `title`,
  `startDate`, `endDate`, `isAllDay`, and `hasRecurrenceRules`, even when the
  optional fields are omitted

#### Scenario: Dead-weight fields are excluded

- **WHEN** any event-returning tool produces a result
- **THEN** no event in the result contains an `isDetached` or `externalId` field

#### Scenario: Recurring occurrence fields are preserved when present

- **WHEN** a returned event is an occurrence of a recurring series
- **THEN** the event includes its `occurrenceDate`
- **AND** that value remains usable as the `occurrenceDate` argument of
  `update_event`

#### Scenario: Internal matching is unaffected by the leaner payload

- **WHEN** a recurring event is updated via `update_event` after the
  client-facing payload has dropped `externalId`
- **THEN** the bridge still resolves the target occurrence correctly

### Requirement: Date arguments are parsed leniently and timestamps are emitted in local time

The system SHALL interpret every date or datetime argument accepted by any MCP tool identically, in priority order: (1) an explicit timezone designator (`Z` or `±HH:MM`) is honored as an exact instant, (2) a naive datetime (`YYYY-MM-DDTHH:MM:SS`, with or without fractional seconds and no designator) is interpreted in the server-local timezone, and (3) a date-only value (`YYYY-MM-DD`) is interpreted as local midnight in the server-local timezone. Genuinely unparseable input SHALL be rejected with a clear error.

The bridge is the authoritative parser and applies these rules to all event parsing. Any tool that additionally interprets a date argument client-side — notably `find_free_slots`, which computes availability over the window in TypeScript — SHALL canonicalize its inputs so that its client-side interpretation matches the bridge's. In particular a date-only value SHALL resolve to local midnight (never UTC midnight), so the window the tool inverts and the events the bridge returns share the same boundary with no offset shift.

Every tool that returns timestamps SHALL emit them with the server-local UTC offset (for example `2026-06-13T10:00:00+02:00`) rather than a UTC `Z` suffix — this covers both event fields (`startDate`, `endDate`, `occurrenceDate`) and computed values (`find_free_slots` slot `start`/`end`). An exact-UTC instant MAY render as `Z` (e.g. when the server-local timezone is itself UTC). The emitted instant SHALL be unchanged by this representation, so a returned `occurrenceDate` remains usable verbatim as the `occurrenceDate` argument of `update_event`.

TypeScript-side input validation SHALL remain lenient: it SHALL NOT reject naive or date-only inputs, leaving the bridge as the single parsing authority for events. The server-local timezone is assumed to equal the user's timezone (local single-user deployment).

#### Scenario: Explicit offset is honored exactly

- **WHEN** a date argument carries a timezone designator (`Z` or `±HH:MM`)
- **THEN** the system parses it as that exact instant without applying any local-timezone fallback

#### Scenario: Naive datetime is interpreted as local

- **WHEN** a date argument is a naive datetime such as `2026-06-13T00:00:00` with no timezone designator
- **THEN** the system interprets it as that wall-clock time in the server-local timezone
- **AND** does not reject it as invalid

#### Scenario: Date-only value is interpreted as local midnight

- **WHEN** a date argument is a date-only value such as `2026-06-13`
- **THEN** the system interprets it as local midnight (00:00) of that day in the server-local timezone

#### Scenario: Unparseable input is rejected

- **WHEN** a date argument is not a recognizable date, datetime, or date-only value
- **THEN** the system returns a tool result flagged as an error whose text identifies the invalid value

#### Scenario: Returned timestamps carry the local offset

- **WHEN** any event-returning tool produces a result
- **THEN** each `startDate`, `endDate`, and `occurrenceDate` is serialized with the server-local UTC offset rather than a `Z` suffix

#### Scenario: find_free_slots resolves a date-only window to local midnight

- **WHEN** `find_free_slots` receives a date-only `startDate` and/or `endDate`
- **THEN** the window it computes availability over and the events the bridge returns for it use the same local-midnight boundary
- **AND** there is no offset shift between the two (a date-only value is not treated as UTC midnight on the client side)

#### Scenario: find_free_slots emits slots with the local offset

- **WHEN** `find_free_slots` returns availability
- **THEN** each slot `start` and `end` carries the server-local UTC offset, consistent with event timestamps (an exact-UTC instant may render as `Z`)

#### Scenario: A returned occurrenceDate round-trips into an update

- **WHEN** a recurring event's `occurrenceDate` is read from `get_events` and passed verbatim as the `occurrenceDate` argument of `update_event`
- **THEN** the bridge resolves the same occurrence, because matching compares the parsed instant rather than the timestamp string

