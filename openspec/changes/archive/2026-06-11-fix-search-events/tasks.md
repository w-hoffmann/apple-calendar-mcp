## 1. Honest field-matching strings

- [x] 1.1 In `src/tools/calendar.ts`, change the `search_events` tool
  `description` (registerTool config, ~L174-180) to
  `"Search events by title, location, or notes (client-side substring filtering)"`.
- [x] 1.2 Change `searchEventsInput.query` `.describe(...)` (~L31-36) to
  `"Search query matched case-insensitively against event title, location, and notes"`
  so it reflects the actual filter and the `event-querying` spec.

## 2. Lock the default search window (no behavior change)

- [x] 2.1 Extract the default-window computation into an exported pure helper
  `getDefaultSearchWindow()` (~L121) and call it from the `search_events` handler.
  Add a comment documenting that `new Date(y, m, d).toISOString()` is the correct
  local-midnight instant and must not be replaced with UTC midnight.
- [x] 2.2 Add a pure unit test in `test/calendar.schema.test.ts` asserting the
  helper's `startDate` is local midnight of the current day
  (`getHours/getMinutes/getSeconds === 0`) and the window spans ~30 days.

## 3. Spec & discoverability contract

- [x] 3.1 Add a "Tool advertises matched fields" scenario to
  `specs/event-querying/spec.md` (the change delta).
- [x] 3.2 Add a unit test asserting the registered `search_events` `description`
  and `query` parameter description name `location` and `notes`.

## 4. Verify

- [x] 4.1 `npm run build` (tsc) — no type errors.
- [x] 4.2 `npx vitest run` — all tests pass, including the new default-window and
  discoverability tests (26 passing).
