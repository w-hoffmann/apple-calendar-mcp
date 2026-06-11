## 1. Fix default search window

- [ ] 1.1 In `src/tools/calendar.ts` (lines 93-95), compute the default `startDate` as the timezone-accurate start of the current local day so the emitted ISO8601 instant corresponds to local midnight (not ~2h early in positive-offset zones), per the "Default search window" scenario in specs/event-querying/spec.md.

## 2. Honest LLM-facing strings

- [ ] 2.1 In `src/tools/calendar.ts` line 79, change the tool description to `"Search events by title, location, or notes (client-side filtering)"`.
- [ ] 2.2 In `src/tools/calendar.ts` line 81, change the `query` parameter `.describe(...)` to `"Search query to match event title, location, or notes"` so it reflects the actual filter (lines 104-109) and the "Matching events are returned" scenario.

## 3. Verify

- [ ] 3.1 Run `npm run build` (tsc) and confirm no type errors.
- [ ] 3.2 Invoke `search_events` with no `startDate`/`endDate` and confirm the resolved start of the window is local midnight of the current day.
