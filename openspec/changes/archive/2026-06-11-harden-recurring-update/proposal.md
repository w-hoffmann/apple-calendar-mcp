## Why

`update_event` markets itself as a reschedule tool with `occurrenceDate` optional, but when a recurring series is targeted without `occurrenceDate` the Swift bridge resolves the series master and silently edits the first occurrence (span `this`) or rewrites the whole series (span `future`), returning `ok`. The natural call therefore mutates the wrong instance without warning.

## What Changes

- **BREAKING** A recurring-event update that omits `occurrenceDate` is now rejected with a descriptive, recoverable error instead of silently editing the series master / first occurrence.
- `span: "future"` now requires `occurrenceDate` — rejected if omitted at **both** the TypeScript and the Swift/CLI boundaries (the bridge is authoritative because it is callable directly via CLI).
- Occurrence lookup matches the occurrence whose `occurrenceDate` (its stable original series slot, as returned by `get_events.occurrenceDate`) equals the supplied value, within a ~1 ms tolerance (the serialization granularity) — instead of taking the first event in the day window. This removes sub-daily ambiguity and correctly resolves detached/moved occurrences (whose `startDate` has diverged from their `occurrenceDate`).
- When a supplied `occurrenceDate` matches no occurrence of a recurring event, the bridge returns a descriptive error telling the caller to pass the exact `get_events.occurrenceDate`, instead of a bare `eventNotFound`.
- Tool description and the `occurrenceDate` field doc clarify that `occurrenceDate` identifies the target occurrence by its `get_events.occurrenceDate` value (the occurrence's original series slot), not the desired new start time, and that recurring targets require it.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `event-modification`: tighten "Control the scope of recurring updates" so targeting a recurring series requires `occurrenceDate`; `span: "future"` requires `occurrenceDate` (enforced at the bridge as well as in TS); `occurrenceDate` is defined as the occurrence's stable series slot (from `get_events.occurrenceDate`); the targeted occurrence is selected by matching that value; and an unmatched `occurrenceDate` returns a descriptive recoverable error instead of silently editing or a bare not-found.

## Impact

- `openspec/specs/event-modification/spec.md` (via this change's delta)
- `swift/Sources/AppleBridge/CalendarService.swift` — `updateEvent` guards (recurring-without-`occurrenceDate`, `span: "future"`-without-`occurrenceDate`) + occurrence matching on `occurrenceDate` + descriptive occurrence-not-found
- `swift/Sources/AppleBridge/Models.swift` — new `BridgeError` cases for the missing-`occurrenceDate` and occurrence-not-found conditions
- `src/tools/calendar.ts` — `update_event` Zod `superRefine` + description/`describe` copy
- No `swift/Sources/AppleBridge/main.swift` change is required: the guards live in `CalendarService.updateEvent`, which the CLI subcommand also calls.
- Coordinate with sibling change `code-cleanup` (and the already-archived `bridge-robustness`), which also edit the `update_event` Zod schema and the Swift `updateEvent` body — see `design.md` → "Cross-change coherence".
