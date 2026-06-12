## 1. Lean event payload (TypeScript)

- [x] 1.1 Add a `LeanEventInfo` type and a `toLeanEvent()` mapper in `src/bridge/swift.ts` that drops `isDetached`/`externalId` and omits null `occurrenceDate`/`timeZone`/`location`/`notes`; keep `id`, `calendarId`, `calendarTitle`, `title`, `startDate`, `endDate`, `isAllDay`, `hasRecurrenceRules` always present
- [x] 1.2 Apply `toLeanEvent()` in `SwiftBridge.events()`, `createEvent()`, and `updateEvent()` so all event-returning paths emit the lean shape; leave the internal `EventInfo` (with `externalId`) intact for matching
- [x] 1.3 Change the shared `wrap()` in `src/tools/calendar.ts` to serialize with `JSON.stringify(data)` (compact, no indentation); this is intentional for **all** tools (incl. `get_calendars`, `find_free_slots`), not only event tools
- [x] 1.4 Verify `externalId`/occurrence matching is unaffected by building the bridge and running `update-event` against a recurring occurrence via the CLI

## 2. Tool annotations, titles, and descriptions (TypeScript)

- [x] 2.1 Add `annotations: { readOnlyHint: true }` to `get_calendars`, `get_events`, `search_events` (and the new `find_free_slots`) registrations; keep/verify a human-readable top-level `title` on each
- [x] 2.2 Add `annotations: { readOnlyHint: false }` to `create_event` and `update_event`; add `destructiveHint: true` to `update_event` (it overwrites existing state) and `destructiveHint: false` **explicitly** to `create_event` (additive — `destructiveHint` defaults to `true` when `readOnlyHint` is `false` per MCP spec 2025-11-25, so it must be set, not omitted)
- [x] 2.3 Sharpen the `get_events` description: state recurring-expansion and that `startDate`/`endDate` are ISO8601 with the event's own `timeZone` reported when set
- [x] 2.4 Sharpen the `create_event` description: state that `calendarId` comes from `get_calendars` and that dates are ISO8601

## 3. Remove get_today_events (TypeScript)

- [x] 3.1 Remove the `get_today_events` tool registration from `src/tools/calendar.ts`
- [x] 3.2 Remove the `today()` method from `SwiftBridge` in `src/bridge/swift.ts` (leave the Swift `today` subcommand for manual/smoke use per design)

## 4. find_free_slots tool (TypeScript)

- [x] 4.1 Add `findFreeSlotsInput` Zod schema (exported for tests): `startDate`, `endDate` (ISO8601), `minDurationMinutes` (positive int, default 30), optional `workingHours` ({ `start`, `end` } as `HH:MM` in the server's local timezone), optional `calendars`/`calendarIds`. No `timezone` param — day boundaries and working hours use the server-local timezone (per design decision 3)
- [x] 4.2 Implement a pure `computeFreeSlots(events, opts)` helper (exported for tests): treat timed events as busy, ignore all-day events, **clip busy events to the window** (boundary-straddling events block only their in-window portion), **drop zero-length events**, merge overlapping *and* touching/back-to-back busy intervals, invert within the window, clip to working hours per local day, drop slots shorter than the minimum; return `{ start, end }[]`
- [x] 4.3 Register the `find_free_slots` tool: fetch events via `bridge.events()` for the **full** window (no bridge-side calendar filter — `computeFreeSlots` owns the names-OR-ids union as the single filtering source), run `computeFreeSlots`, return via `wrap()`
- [x] 4.4 Return `[]` (not an error) for a fully booked window; propagate bridge read failures as `isError`

## 5. Recurrence creation (TypeScript + Swift)

- [x] 5.1 Add an optional `recurrence` object to `createEventInput`: `frequency` enum (`daily`/`weekly`/`monthly`/`yearly`), `interval` (int ≥ 1, default 1), `endDate` (ISO8601), `occurrenceCount` (int ≥ 1), optional `daysOfWeek` (codes `MO`/`TU`/`WE`/`TH`/`FR`/`SA`/`SU`, **weekly only** — reject for other frequencies). Enforce `endDate` XOR `occurrenceCount` (and the `daysOfWeek`-weekly rule) in a single `superRefine()` co-located in `createEventInput`, mirroring `updateEventSchema`
- [x] 5.2 Extend `CreateEventOpts` and `buildCreateArgs()` in `src/bridge/swift.ts` to pass recurrence as new CLI flags
- [x] 5.3 Add the recurrence flags/options to the Swift `create-event` command in `swift/Sources/AppleBridge/AppleBridge.swift`, validating frequency, the `daysOfWeek`-weekly rule, and the end exclusivity before requesting access
- [x] 5.4 Build an `EKRecurrenceRule` in `swift/Sources/AppleBridge/CalendarService.swift` `createEvent` and attach it to the event before save
- [x] 5.5 Verify via the CLI: create a weekly event with `interval`, with `endDate`, and with `occurrenceCount`; confirm `hasRecurrenceRules` is true and the series expands in `get_events`

## 6. Tests

- [x] 6.1 Extend `test/calendar.schema.test.ts`: assert `get_today_events` is no longer registered, read tools carry `readOnlyHint: true`, write tools `readOnlyHint: false`, `update_event` carries `destructiveHint: true`, `create_event` carries `destructiveHint: false` (explicit), and each tool has a `title`. Update the in-process MCP integration test for the 5-tool + `find_free_slots` surface, and teach `test/fixtures/fake-bridge.mjs` the new `create-event` recurrence flags
- [x] 6.2 Add description-content assertions for `get_events` (recurring/ISO8601) and `create_event` (calendarId source / ISO8601)
- [x] 6.3 Add unit tests for the lean mapper (`isDetached`/`externalId` absent, null fields omitted, identity/boolean fields present incl. always-present `endDate` for all-day events, `occurrenceDate` omitted when null) and for compact serialization
- [x] 6.4 Add `findFreeSlotsInput` schema tests and `computeFreeSlots` unit tests (merge, min-duration, working hours, all-day ignored, calendar filter, fully-booked → `[]`, window-boundary clipping, back-to-back merge, zero-length events ignored)
- [x] 6.5 Add recurrence schema tests: `endDate` XOR `occurrenceCount` rejection, `interval` ≤ 0 rejection, `daysOfWeek` rejected for non-weekly frequencies, default `interval` = 1, each `frequency` accepted; plus recurrence arg-builder tests for `buildCreateArgs()`

## 7. Documentation

- [x] 7.1 Update `CLAUDE.md` tool list and CLI examples (5 tools + `find_free_slots`, recurrence flags incl. `daysOfWeek` weekly-only, `get_today_events` removed)
- [x] 7.2 Update the `README.md` tool list and the `event-querying` spec Purpose line (drop the `get_today_events` mention) to match the merged surface
- [x] 7.3 Run `npm test` and `npm run typecheck`; build the Swift bridge and confirm `doctor`/`create-event` succeed
