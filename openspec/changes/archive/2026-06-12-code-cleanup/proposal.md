# Code Cleanup

## Why

Two small issues: `update_event` performs a pointless write when given no mutable
fields, and the `execa` bridge call relies on an uncapped (100MB default) output
buffer.

## What Changes

- Reject `update_event` calls that supply no mutable field (only
  `eventId`/`span`/`occurrenceDate`) with a validation error instead of issuing a
  no-op write.
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

- `src/tools/calendar.ts` — merge a "≥1 mutable field" rule into the existing
  `update_event` `superRefine`.
- `src/bridge/swift.ts` — add `maxBuffer` to the execa options.
- `openspec/specs/event-modification/spec.md` — updated at archive time.
