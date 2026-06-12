## 1. Swift bridge — lenient input parsing

- [x] 1.1 In `swift/Sources/AppleBridgeCore/Models.swift`, give `parseISO8601` an injectable `zone: TimeZone = .current` parameter (testability seam; production keeps the default). The naive/date-only fallback formatters key off this `zone`, not a hardcoded `.current`
- [x] 1.2 Add naive-datetime fallback `DateFormatter`s (`yyyy-MM-dd'T'HH:mm:ss` and `yyyy-MM-dd'T'HH:mm:ss.SSS`) with `timeZone = zone` and `locale = en_US_POSIX(_:)`
- [x] 1.3 Add a minute-precision fallback `DateFormatter` (`yyyy-MM-dd'T'HH:mm`, no seconds) with `timeZone = zone`, so `2026-06-13T10:00` is accepted as naive-local (matches JS `new Date`)
- [x] 1.4 Add a date-only fallback `DateFormatter` (`yyyy-MM-dd`) with `timeZone = zone`, yielding local midnight
- [x] 1.5 Rewrite `parseISO8601` to try, in order: offset-aware ISO formatters (exact) → naive datetime fallbacks (seconds/fractional, then `HH:mm`) → date-only fallback → throw `BridgeError.invalidDate`
- [x] 1.6 Confirm no caller of `parseISO8601` depends on rejecting naive/date-only input (search the executable + `CalendarService`)

## 2. Swift bridge — local-offset output

- [x] 2.1 Change `formatISO8601` to emit the server-local UTC offset instead of `Z`, via an `ISO8601DateFormatter` whose `timeZone` is an injectable `zone: TimeZone = .current` (it then renders `±HH:MM`; a UTC zone still renders `Z`). Keep fractional seconds per the design's open-question default
- [x] 2.2 Verify all event-emitting paths (`startDate`, `endDate`, `occurrenceDate`) route through `formatISO8601` so output is uniform

## 3. Swift tests (`swift test`)

> Pass an explicit `zone: Europe/Berlin` to `parseISO8601`/`formatISO8601` in these tests so they are deterministic under the UTC CI (do not rely on the `.current` default for offset assertions).

- [x] 3.1 Add parse cases: explicit `Z` and `±HH:MM` offsets resolve to the exact instant (zone-independent — the designator wins regardless of the injected `zone`)
- [x] 3.2 Add parse cases (with `zone: Europe/Berlin`): naive datetime with and without fractional seconds, and the `HH:mm`-without-seconds form, resolve in that zone; date-only resolves to local midnight in that zone
- [x] 3.3 Add parse case: genuinely invalid input still throws `BridgeError.invalidDate`
- [x] 3.4 Add format cases: `formatISO8601(_, zone: Europe/Berlin)` carries `+02:00` (summer) / `+01:00` (winter), and `formatISO8601(_, zone: UTC)` renders `Z`. This pins the local-offset behavior without depending on CI's `TimeZone.current`
- [x] 3.5 Add all-day format case: an all-day event's local-midnight `Date` formats as `…T00:00:00+02:00` under `Europe/Berlin` (guards against an accidental UTC `…T22:00:00Z` regression)
- [x] 3.6 Add round-trip case: a `formatISO8601` output parsed back via `parseISO8601` yields the original instant, for both a non-UTC and the default zone (guards the `occurrenceDate` round-trip / `SlotMatcher` contract)

## 4. TypeScript — descriptions & timezone injection

- [x] 4.1 In `src/tools/calendar.ts`, add a helper that resolves the server timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` and builds the shared date-field description (local default, offset honored, date-only allowed, names the timezone)
- [x] 4.2 Apply the helper to every date input field: `get_events`, `search_events`, `create_event`, `update_event`, `find_free_slots`, and the recurrence `endDate`
- [x] 4.3 Update the `get_events` tool-level description to state the local/offset/date-only input semantics and local-offset output (satisfies the modified advertise scenario)
- [x] 4.4 Update the `find_free_slots` tool-level description to state that returned slot `start`/`end` carry the local offset (parallels 4.3), and that a date-only window is read as local midnight
- [x] 4.5 Confirm Zod date fields stay `z.string()` (no `.datetime()` enforcement) so naive/date-only reach Swift

## 5. TypeScript — find_free_slots window & output (the second parser)

- [x] 5.1 In `src/tools/calendar.ts`, add a `canonicalizeDateArg(s)` helper: if `s` matches `^\d{4}-\d{2}-\d{2}$`, return `s + "T00:00:00"`, else return `s` unchanged. This canonicalizes the **one** form on which JS `new Date()` and the Swift bridge diverge (date-only: JS=UTC, Swift=local) — it does NOT re-encode the offset/naive rules (decision 6)
- [x] 5.2 In the `find_free_slots` handler, canonicalize `startDate`/`endDate` once and pass the **same** values to both `bridge.events(...)` and `computeFreeSlots(...)`, so the events fetched and the inversion window share an identical boundary
- [x] 5.3 Add a `formatLocalISO(ms)` helper that emits the server-local offset (`±HH:MM`), rendering `Z` when the offset is zero to mirror Swift's `formatISO8601`. Replace the two `new Date(...).toISOString()` calls in `computeFreeSlots` with it
- [x] 5.4 Confirm `getDefaultSearchWindow` is unaffected (it already emits a correct local-midnight instant; it stays internal and is never shown to the user)
- [x] 5.5 Add unit tests: a date-only `find_free_slots` window resolves to local midnight (window matches the events boundary, no offset shift); slot output carries the local offset; `formatLocalISO` renders `+02:00` for `+120` min and `Z` for `0`

## 6. Test & fixture audit (vitest `unit`)

- [x] 6.1 Grep the `test/` tree for hardcoded `...Z` timestamps in fixtures, bridge contract tests, and in-process integration assertions
- [x] 6.2 Update affected assertions/fixtures. Prefer asserting on the **parsed instant** (`new Date(x).getTime()`) over the literal string, since local-offset output is timezone-dependent and CI runs in UTC. `toLeanEvent` is format-agnostic pass-through, so its fixtures (`lean-event.test.ts`) need no format change — only assertions that lock an output *format* do
- [x] 6.3 `free-slots.test.ts`: `computeFreeSlots` output is no longer `...Z` — assert slots on the parsed instant (the dedicated format assertion lives in 5.5's `formatLocalISO` test)
- [x] 6.4 Run `npm test` and `npm run typecheck` green

## 7. Docs

- [x] 7.1 Update `CLAUDE.md` ISO8601 troubleshooting note and any "Swift expects format" wording to describe the lenient input (offset / naive-local / `HH:mm` / date-only) + local-offset output, plus the server-TZ == user-TZ assumption
- [x] 7.2 Update `README` date-format wording to match

## 8. Build & verify

- [x] 8.1 Run `./scripts/build.sh` (Swift + TypeScript) clean
- [x] 8.2 Smoke-check via the bridge: `get-events` with a naive `startDate` parses and returns local-offset timestamps; an explicit `Z`/offset still works
- [x] 8.3 Smoke-check `find_free_slots` with a **date-only** window: returned slots align with the local day (no offset-shifted boundary) and carry the local offset

## 9. Review follow-ups (adversarial multi-agent review)

- [x] 9.1 Align `create_event` **and** `update_event` tool-level descriptions with the new lenient/local contract (the per-field descriptions and `get_events`/`find_free_slots` tool text already advertise it; these two still said bare "ISO8601" / nothing). Update the `calendar.schema.test.ts` assertion that pinned the old `"iso8601"` wording
- [x] 9.2 Add an in-process integration test exercising the `find_free_slots` **date-only window canonicalization through the real handler** (assert `bridge.events` receives `…T00:00:00` and slots align to the local-day boundary) — the handler wiring was previously only covered indirectly
- [x] 9.3 **Reject** a well-formed but out-of-range date (`2026-02-30` → would roll to Mar 2) and non-zero-padded components instead of silently normalizing them: round-trip-validate each naive/date-only parse in `parseISO8601` (reformat and compare to input). Docstring updated to the strict contract + Swift regression tests added. (Verify-driven escalation of the earlier docstring-only mitigation — closes the one open SUGGESTION.)
- [x] 9.4 Restore a cached default-zone output formatter in Swift `formatISO8601` (the injectable-zone refactor made it allocate a fresh `ISO8601DateFormatter` per timestamp on the output hot path); build a throwaway only for a non-default injected zone
- [x] 9.5 Add a spring-forward DST regression test (only fall-back was covered) so both DST directions guard the local-clock working-hours anchoring
- [x] 9.6 Pin the TS `formatLocalISO` ↔ Swift `formatISO8601` shape equivalence with a byte-identical literal asserted in both suites (so the two "local-offset ISO" implementations cannot silently diverge)
