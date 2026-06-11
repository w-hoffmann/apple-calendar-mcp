## 1. Swift bridge safety net

- [ ] 1.1 In `swift/Sources/AppleBridge/Models.swift`, add `BridgeError` cases `recurringRequiresOccurrenceDate`, `spanFutureRequiresOccurrenceDate`, and `occurrenceNotFound(String)`, and handle each in the **exhaustive `description` switch** (which `errorDescription` returns). Messages must instruct the caller to pass `occurrenceDate` taken from `get_events.occurrenceDate`.
- [ ] 1.2 In `swift/Sources/AppleBridge/CalendarService.swift` `updateEvent` (~159-209): add the guard `occurrenceDate == nil && span == .futureEvents` → throw `spanFutureRequiresOccurrenceDate` **before** resolving the event, so the direct-CLI path is covered too. After resolving `ev`, throw `recurringRequiresOccurrenceDate` when `ev.hasRecurrenceRules && occurrenceDate == nil` (fires only in the `occurrenceDate == nil` branch, where `ev` is the series master).
- [ ] 1.3 In the occurrence-lookup branch (~175-180), select the event whose `occurrenceDate` matches the supplied value within a sub-second tolerance **and** whose id matches, instead of `events.first` — e.g.
  `events.first { abs($0.occurrenceDate.timeIntervalSince(occ)) < 1 && ($0.eventIdentifier == eventId || $0.calendarItemExternalIdentifier == eventId) }`.
  `EKEvent.occurrenceDate` is a non-optional `Date` here (it is already consumed non-optionally by `eventToInfo` at CalendarService.swift ~226), so no optional binding is needed. Match `occurrenceDate`, **not** `startDate` (`get_events` emits `occurrenceDate`; a moved occurrence's `startDate` diverges). See design "Match on `occurrenceDate`, with tolerance".
- [ ] 1.4 In the occurrence-lookup branch, when no event matches the id + `occurrenceDate` test, decide whether the target series is recurring before erroring: check the window results matched by **either** id form — `events.first { $0.eventIdentifier == eventId || $0.calendarItemExternalIdentifier == eventId }?.hasRecurrenceRules == true` — falling back to `store.event(withIdentifier: eventId)?.hasRecurrenceRules == true` for the canonical-id / moved-outside-window case. If recurring, throw `occurrenceNotFound` (descriptive, points at `get_events.occurrenceDate`); otherwise keep `eventNotFound`. (The window check honors callers who passed `calendarItemExternalIdentifier`, which `store.event(withIdentifier:)` does not resolve.)

## 2. TypeScript tool validation & copy

- [ ] 2.1 In `src/tools/calendar.ts` `update_event` Zod schema (~166-189), add a `.superRefine` that fails when `span === "future"` and `occurrenceDate` is absent, with the message that `occurrenceDate` is required for `span: "future"`. If a sibling change already added a `superRefine`, **merge** the rule into it rather than replacing it (see design "Cross-change coherence").
- [ ] 2.2 Update the `update_event` tool description and the `occurrenceDate` `.describe(...)` to state that `occurrenceDate` is the occurrence's identifier from `get_events.occurrenceDate` (its original series slot), **not** the new time, and that recurring targets require it. Do not promise byte-exact passback — the bridge matches within a sub-second tolerance.

## 3. Verification

- [ ] 3.1 Build the bridge: `cd swift && swift build -c release` and re-sign per CLAUDE.md.
- [ ] 3.2 Smoke-check against a recurring event:
  - update without `occurrenceDate` (span `this`/default) → descriptive `recurringRequiresOccurrenceDate` error, not `ok`.
  - `--span future` without `occurrenceDate` (direct CLI) → `spanFutureRequiresOccurrenceDate` error, not a series rewrite.
  - valid `occurrenceDate` from `get_events` → the targeted occurrence updates; confirm a sibling occurrence is untouched (span `this`).
  - deliberately wrong `occurrenceDate` → descriptive `occurrenceNotFound`, not bare `eventNotFound`.
  - (if available) a daily/sub-daily series → the instance identified by `occurrenceDate` is the one changed.
- [ ] 3.3 Build TypeScript: `npm run build` (tsc), confirm no type errors; confirm `span: "future"` without `occurrenceDate` is rejected by the Zod refinement.
