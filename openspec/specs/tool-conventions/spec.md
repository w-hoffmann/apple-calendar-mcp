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

