## 1. Reject no-op updates (behavior)

- [x] 1.1 In `src/tools/calendar.ts`, merge a rule into `updateEventSchema`'s
      existing `.superRefine` requiring at least one of `title`, `startDate`,
      `endDate`, `timeZone`, `allDay`, `location`, `notes`, `calendarId`; on
      failure emit a validation issue describing that at least one mutable field
      is required (per the `event-modification` "Reject no-op updates"
      requirement). Add a second `ctx.addIssue` to the existing refine body — do
      not add a second `.superRefine` — so it coexists with the `span: "future"`
      ⇒ `occurrenceDate` rule. The handler already enforces the schema via
      `updateEventSchema.safeParse(args)`, so no handler change is needed. Extend
      `test/calendar.schema.test.ts` with a no-op-rejection case.

## 2. Bound the bridge output buffer

- [x] 2.1 In `src/bridge/swift.ts`, add `maxBuffer: 10 * 1024 * 1024` to the
      `execa` options in the `exec` method.

## 3. Verification

- [x] 3.1 `npm run typecheck` (tsc --noEmit) succeeds with no type errors.
- [x] 3.2 `npm test` passes, including the new no-op-rejection schema case.
- [x] 3.3 Confirm an `update_event` call with only `eventId` is rejected with a
      validation error and triggers no bridge invocation / save.
- [x] 3.4 Confirm `src/bridge/swift.ts` passes `maxBuffer: 10 * 1024 * 1024` to
      the `execa` call and a normal bridge call (e.g. `apple-bridge today`) still
      succeeds.
