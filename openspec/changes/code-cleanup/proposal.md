# Code Cleanup

## Why

A handful of nit-level issues add risk and duplication: `update_event` performs a
pointless write when given no mutable fields, and three pure refactors remove
dead branching, repeated boilerplate, and an absurd default I/O buffer.

## What Changes

- Reject `update_event` calls that supply no mutable field (only
  `eventId`/`span`/`occurrenceDate`) with a validation error instead of issuing a
  no-op write.
- Collapse the two character-identical `accessStatus()` switch branches in Swift
  `CalendarService` into a single switch (the `#available(macOS 14.0, *)` guard is
  unnecessary; `authorizationStatus(for:)` exists since macOS 10.9).
- Extract a shared `wrap(fn)` helper in `src/tools/calendar.ts` that builds the
  `{ content, isError }` tool-result envelope, replacing the identical try/catch
  duplicated across all 6 tools.
- Add a `maxBuffer` cap (~10MB) to the `execa` call in `src/bridge/swift.ts`
  instead of relying on the 100MB default.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `event-modification`: add a requirement that `update_event` rejects no-op
  updates (no mutable field supplied) with a validation error and performs no
  save.

## Impact

- `src/tools/calendar.ts` — add `update_event` superRefine; extract `wrap` helper.
- `src/bridge/swift.ts` — add `maxBuffer` to execa options.
- `swift/Sources/AppleBridge/CalendarService.swift` — collapse `accessStatus()`.
- `openspec/specs/event-modification/spec.md` — updated at archive time.
- Coordinate with sibling in-progress changes `harden-recurring-update` and `bridge-robustness`, which also edit the `update_event` Zod schema and the Swift `updateEvent` body — see `design.md` → "Cross-change coherence".
