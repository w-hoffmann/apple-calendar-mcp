## Why

A cluster of low-severity defensive gaps lets bad input crash the Swift bridge (a nil `eventIdentifier` reaching the non-optional `EventInfo.id` on the `update_event` return path) or pass silently to opaque EventKit errors instead of clean, descriptive failures.

## What Changes

- Swift `eventToInfo` guards a nil `eventIdentifier` instead of letting it implicitly force-unwrap. `EKEvent.eventIdentifier` is an implicitly-unwrapped optional (`String!`); assigning it to the non-optional `EventInfo.id` traps on nil (reachable on the `update_event` occurrence return path).
- `create_event` and `update_event` reject an invalid time-zone identifier. The create path previously dropped an invalid `timeZone` silently; update already threw.
- `create_event` and `update_event` reject a resulting `start >= end` before `store.save`, instead of surfacing an opaque EventKit save error. The update check compares the event's final dates, so a partial update inverting against an existing value is also caught.
- `create_event` and `update_event` reject an empty title at the Swift bridge (the trust boundary), in addition to the TypeScript `.min(1)` guard — so the rejection holds for direct-CLI callers too.
- `update_event` rejects an unrecognized recurrence `span` value and conflicting all-day flags instead of silently coercing them.
- A dedicated `BridgeError.invalidTimeZone` case so invalid-time-zone messages no longer carry the contradictory `Invalid ISO8601 date:` prefix.
- TypeScript `create_event` and `update_event` title Zod schemas require a non-empty string (`.min(1)`).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities

- `event-creation`: add a requirement that `create_event` rejects inputs that cannot form a valid event (invalid time-zone identifier, empty title, `start >= end`), consistently with `update_event`.
- `event-modification`: add a requirement that `update_event` rejects inputs that cannot form a valid event (empty title, `start >= end`, unknown span, conflicting all-day flags).

## Impact

- `swift/Sources/AppleBridge/CalendarService.swift` — `eventToInfo` (nil-identifier guard), `createEvent` and `updateEvent` (invalid time zone, `start >= end`, empty title)
- `swift/Sources/AppleBridge/main.swift` — `UpdateEvent.run` span / all-day validation
- `swift/Sources/AppleBridge/Models.swift` — `BridgeError.invalidTimeZone` case
- `src/tools/calendar.ts` — title Zod schema `.min(1)`
- Coordinate with sibling in-progress changes `harden-recurring-update` and `code-cleanup`, which also edit the `update_event` Zod schema and the Swift `updateEvent` body — see `design.md` → "Cross-change coherence".
