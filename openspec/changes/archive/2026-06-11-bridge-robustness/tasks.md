## 1. Swift bridge crash & error fixes

- [x] 1.1 In `swift/Sources/AppleBridge/Models.swift`, add a `BridgeError.invalidTimeZone(String)` case with a `LocalizedError` description like `Invalid time zone: <id>` (distinct from the `Invalid ISO8601 date:` prefix of `invalidDate`).
- [x] 1.2 In `swift/Sources/AppleBridge/CalendarService.swift` `eventToInfo` (~216), assign `id` from `event.eventIdentifier ?? ""`. `EKEvent.eventIdentifier` is an implicitly-unwrapped optional (`String!`), so assigning it to the non-optional `EventInfo.id` implicitly force-unwraps and traps on nil on the `update_event` return path (per design "Guard the identifier").
- [x] 1.3 In `swift/Sources/AppleBridge/CalendarService.swift` `createEvent` (~148), construct `TimeZone(identifier:)` and throw `BridgeError.invalidTimeZone` when nil, matching `updateEvent`.
- [x] 1.4 In `swift/Sources/AppleBridge/CalendarService.swift` `updateEvent` (~195-200), switch the invalid-time-zone throw to `BridgeError.invalidTimeZone`.
- [x] 1.5 In `swift/Sources/AppleBridge/CalendarService.swift` `updateEvent`, after applying start/end fields and before `store.save`, throw a clear `BridgeError` when the resulting `ev.startDate >= ev.endDate`. Compare the event's final dates (not just the provided params) so a partial update that inverts against an existing value is also caught.
- [x] 1.6 In `swift/Sources/AppleBridge/CalendarService.swift` `createEvent`, before `store.save`, throw the same `start >= end` `BridgeError` (parity with `updateEvent`; a new event is the more likely inverted-range case).
- [x] 1.7 In `swift/Sources/AppleBridge/CalendarService.swift`, reject an empty title with a `BridgeError`: in `createEvent` always, in `updateEvent` only when a title is supplied. Holds the trust boundary for direct-CLI callers; companion to the TS `.min(1)` guard (tasks 3.1/3.2). Use the same "non-empty" rule as `.min(1)` (no trimming).

## 2. Swift CLI argument validation

- [x] 2.1 In `swift/Sources/AppleBridge/main.swift` `UpdateEvent.run` (~206), validate `--span` is one of `{this, future}` and throw a `BridgeError` for any other value instead of coercing to `.thisEvent`.
- [x] 2.2 In `swift/Sources/AppleBridge/main.swift` `UpdateEvent.run`, reject the combination of `--all-day` and `--no-all-day` with a `BridgeError` instead of silently resolving to `true`.

## 3. TypeScript validation

- [x] 3.1 In `src/tools/calendar.ts`, add `.min(1)` to the `title` Zod schema for `create_event`.
- [x] 3.2 In `src/tools/calendar.ts`, add `.min(1)` to the `title` Zod schema for `update_event` (composes with the existing `.optional()`: absent allowed, empty string rejected).

## 4. Verification

- [x] 4.1 Build the Swift bridge: `cd swift && swift build -c release` (then codesign per CLAUDE.md).
- [x] 4.2 Build TypeScript: `npm run build`.
- [x] 4.3 CLI smoke tests of each rejection: invalid `--time-zone` and inverted start/end on **both** create-event and update-event, an empty title on create-event and update-event, an unknown `--span`, and conflicting `--all-day --no-all-day`; confirm each returns a clear `{"status":"error",...}` envelope and does not crash.
- [x] 4.4 Confirm `update_event` returning a detached occurrence no longer crashes (empty `id` tolerated).
