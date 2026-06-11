## 1. Reject no-op updates (behavior)

- [ ] 1.1 In `src/tools/calendar.ts`, add a `.superRefine` to the `update_event`
      argument schema requiring at least one of `title`, `startDate`, `endDate`,
      `timeZone`, `allDay`, `location`, `notes`, `calendarId`; on failure emit a
      validation issue describing that at least one mutable field is required (per
      the `event-modification` "Reject no-op updates" requirement).

## 2. Refactors (no behavior change)

- [ ] 2.1 In `src/tools/calendar.ts`, add a shared `wrap(fn)` helper that runs an
      async producer and returns the `{ content, isError }` envelope (success →
      JSON 2-space text; throw → `String(e)` with `isError: true`); apply it to
      all 6 tools to remove the duplicated try/catch (per design Decisions).
- [ ] 2.2 In `swift/Sources/AppleBridge/CalendarService.swift`, collapse
      `accessStatus()` (~lines 38-60) into a single switch on
      `EKEventStore.authorizationStatus(for: .event)`, removing the unnecessary
      `if #available(macOS 14.0, *)` wrapper.
- [ ] 2.3 In `src/bridge/swift.ts`, add `maxBuffer: 10 * 1024 * 1024` to the
      `execa` options in the `exec` method.

## 3. Verification

- [ ] 3.1 Build the Swift bridge: `cd swift && swift build -c release` succeeds.
- [ ] 3.2 Build TypeScript: `npm run build` (tsc) succeeds with no type errors.
- [ ] 3.3 Confirm an `update_event` call with only `eventId` is rejected with a
      validation error and triggers no bridge invocation / save.
