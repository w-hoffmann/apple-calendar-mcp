> **Status: Implemented — all 27 tasks complete; ready to archive.** Built on
> the already-merged layered test suite (`add-layered-test-suite`, commit
> `6bd6a1f`). This is a *breaking* tool-surface change (drops `get_today_events`,
> merges the surface back to 6 tools with `find_free_slots`, leans the event
> payload); the merged contract/integration tests that pinned the old 6-tool
> surface were updated to the new surface as part of this change. Verified:
> `npm test` (86) + `npm run typecheck` + `swift test` (40) all green, and the
> recurrence create / single-occurrence update write paths were exercised live
> against an ephemeral self-cleaning `MCP-E2E-*` marker calendar.

## Why

The MCP tool surface works but is not tuned for a fast, low-overhead personal
assistant. Event responses are pretty-printed with ~14 fields each (incl.
dead-weight `isDetached`/`externalId` and always-present nulls), so a busy week
costs ~2,500 tokens per read. Tools carry no MCP annotations, so the client
cannot tell read tools from write tools. Two real assistant capabilities are
missing — finding free time and creating recurring events — and `get_today_events`
duplicates a date range `get_events` already covers. This change tightens the
surface to current MCP best practices (spec 2025-11-25) without growing the
maintenance burden.

## What Changes

- **Lean event payload**: client-facing event JSON is compact (not
  pretty-printed), omits null/empty optional fields, and drops `isDetached` and
  `externalId` from the response. This applies to **every event-returning tool**
  (`get_events`, `search_events`, `create_event`, `update_event`). `externalId`
  stays internal to Swift occurrence matching — only the client-facing JSON
  changes. Target ~40–50% fewer tokens per `get_events` read.
- **MCP tool annotations + titles**: every tool advertises honest annotations —
  `readOnlyHint: true` on the read tools (`get_calendars`, `get_events`,
  `search_events`, `find_free_slots`), `readOnlyHint: false` on the write tools
  (`create_event`, `update_event`), and `destructiveHint: true` on `update_event`
  (it overwrites existing event state) vs. `destructiveHint: false` on
  `create_event` (additive — set explicitly, since `destructiveHint` defaults to
  `true` when `readOnlyHint` is `false`) — plus a top-level human-readable
  `title`. We deliberately
  skip `outputSchema`/`structuredContent`: they are valid in MCP spec 2025-11-25
  and the SDK, but add schema-maintenance overhead with no payoff at this scale —
  a scope choice, not a client-compatibility workaround.
- **Sharper tool descriptions**: `get_events` states recurring-expansion and
  time-zone semantics; `create_event` states that `calendarId` comes from
  `get_calendars` and that dates are ISO8601.
- **New `find_free_slots` tool**: returns free time gaps within a window
  (params: `startDate`, `endDate`, minimum duration, optional working-hours and
  calendar filter). Computed entirely in the TypeScript layer from existing
  bridge data — no new Swift.
- **Recurrence in `create_event`**: optional `recurrence` parameter
  (`frequency` daily/weekly/monthly/yearly, `interval`, `endDate` OR
  `occurrenceCount`, optional `daysOfWeek`) maps to an `EKRecurrenceRule` in the
  Swift layer. No new tool.
- **BREAKING**: remove `get_today_events`. The model knows today's date and can
  call `get_events` with a one-day range; this removes a redundant tool
  definition from the client's context.
- `delete_event` is explicitly **out of scope** for this change.

## Capabilities

### New Capabilities

- `availability`: find free time within a date range, honoring a minimum slot
  duration and optional working-hours/calendar constraints. Backed by a new
  `find_free_slots` MCP tool, computed client-side from existing event data.
- `tool-conventions`: cross-cutting MCP presentation contract — honest tool
  annotations (`readOnlyHint`, `destructiveHint`) and titles for every tool, plus
  the canonical lean event payload shape (compact JSON, omitted null fields, no
  `isDetached`/`externalId`) returned by all event-emitting tools.

### Modified Capabilities

- `event-querying`: remove the `get_today_events` requirement; align the
  `get_events` returned-field set with the lean payload (no `isDetached`/
  `externalId`); state recurring-expansion and time-zone semantics in the tool
  description. `search_events` also returns the lean shape, governed by the
  cross-cutting `tool-conventions` contract rather than a per-tool delta.
- `event-creation`: add the ability to create recurring events via a
  `recurrence` parameter; state the `calendarId` source and ISO8601 date format
  in the tool description. The created event is returned in the lean shape.
- `event-modification`: `update_event` returns the updated event in the lean
  shape and advertises `readOnlyHint: false` + `destructiveHint: true`. No
  behavior change beyond presentation; the lean shape is governed by the
  cross-cutting `tool-conventions` contract, so no per-tool delta is added.

## Impact

- **Code**: `src/tools/calendar.ts` (annotations, titles, descriptions,
  `find_free_slots`, remove `get_today_events`, `recurrence` input, switch the
  shared `wrap()` to compact JSON — affects every tool, see design decision 1);
  `src/bridge/swift.ts` (lean event mapping for client-facing JSON,
  `recurrence` arg builder, drop the `today()` call); Swift
  `AppleBridge.swift` (the `create-event` subcommand recurrence flags),
  `CalendarService.swift` (build `EKRecurrenceRule`), `Models.swift`
  (recurrence DTO if needed).
- **Tests**: extend `test/calendar.schema.test.ts` for the new/changed schemas,
  annotation presence (incl. `destructiveHint`), and the removal of
  `get_today_events`; assert lean serialization and annotations end-to-end in the
  in-process MCP integration test; teach the fake bridge
  (`test/fixtures/fake-bridge.mjs`) the new `create-event` recurrence flags so the
  contract test covers them; add free-slot computation tests.
- **Docs**: update `CLAUDE.md` and `README.md` tool list (5 tools + `find_free_slots`).
- **Clients**: any consumer relying on `get_today_events` must switch to
  `get_events` (BREAKING). No external dependencies added.
