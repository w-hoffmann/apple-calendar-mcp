## Why

`get_events` rejects the naive ISO8601 datetimes (`2026-06-13T00:00:00`) that Claude Desktop emits by default, forcing a wasted error/retry roundtrip before the model self-corrects to `...Z`. Worse, results come back as UTC `...Z` while the user lives and thinks in a local timezone, so a "local Saturday" window can silently shift by the UTC offset. On a local single-user Mac the server already knows the user's timezone — date handling should be forgiving and timezone-correct instead of UTC-literal.

## What Changes

- Swift `parseISO8601` accepts input in priority order: **explicit offset** (`Z` or `±HH:MM`) parsed exactly, then **naive datetime** (`2026-06-13T00:00:00`, with or without fractional seconds) interpreted in the **server-local timezone**, then **date-only** (`2026-06-13`) as local midnight. An explicit offset always wins.
- **BREAKING**: event timestamps in tool output (`startDate`, `endDate`, `occurrenceDate`) are emitted with the server-local UTC offset (e.g. `2026-06-13T10:00:00+02:00`) instead of UTC `Z`. The instant is unchanged and the round-trip into `update_event` is preserved — occurrence matching compares instants within a 1 ms tolerance, not timestamp strings.
- Date-field tool descriptions are rewritten: local wall-clock time is the default, an explicit offset is honored, and date-only is allowed. The server's resolved timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) is injected into the description at tool registration so the model knows the user's timezone.
- Zod input validation stays lenient (no `.datetime()` enforcement) so naive and date-only inputs reach Swift, which remains the single source of truth for parsing and returns a clear error on genuinely invalid input.
- `find_free_slots` — the one tool that also parses its window client-side (JS `new Date()` for the inversion math) — canonicalizes a date-only window to local midnight before use (JS would otherwise read date-only as **UTC** midnight, shifting the window off the events the bridge returns) and emits its slot timestamps with the local offset too, so its output matches the event tools. Same canonical string feeds both the bridge and the pure computation.
- Minute-precision datetimes without seconds (`2026-06-13T10:00`) are accepted as well (naive, local), closing the one common shape the seconds-only formatters would reject.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `tool-conventions`: add the cross-cutting date contract — lenient, offset-wins input parsing (naive → server-local, date-only → local midnight) and local-offset timestamp output, applied uniformly across every date-taking and timestamp-emitting tool. The bridge is the authoritative parser; any tool that also interprets dates client-side (`find_free_slots`) canonicalizes its inputs to match, and computed slot timestamps carry the local offset like event fields.
- `event-querying`: the `get_events` description now advertises the local-default / offset-honored / date-only input semantics and local-offset output, including the injected server timezone — replacing the bare "`startDate`/`endDate` are ISO8601" wording.

## Impact

- **Swift**: `swift/Sources/AppleBridgeCore/Models.swift` — `parseISO8601` (naive + `HH:mm` + date-only fallbacks via `DateFormatter`) and `formatISO8601` (local offset); both take an injectable `zone: TimeZone = .current` so the new `swift test` cases are deterministic under a UTC CI.
- **TypeScript**: `src/tools/calendar.ts` — date-field descriptions and server-timezone injection (Zod stays lenient); `find_free_slots` date-only window canonicalization feeding both the bridge call and `computeFreeSlots`; a `formatLocalISO` helper so slot output carries the local offset (rendering `Z` only when the offset is zero, mirroring Swift).
- **Tests**: vitest `unit` fixtures / in-process integration assertions that hardcode `...Z` timestamps need auditing and updating; `free-slots.test.ts` output assertions move to the local-offset shape (asserted on the parsed instant to stay CI-stable).
- **Docs**: `CLAUDE.md` and `README` ISO8601 format and troubleshooting notes.
- **Assumption**: server timezone equals user timezone — true for a local single-user Mac; documented, not enforced.
- **DST**: naive/date-only inputs resolve through `TimeZone.current`, which is correct year-round; a static offset baked into a description would be wrong half the year, which is the key reason input stays local-naive rather than offset-injected.
