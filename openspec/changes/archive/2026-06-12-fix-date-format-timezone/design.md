## Context

The Swift bridge parses every date input through `parseISO8601` (`AppleBridgeCore/Models.swift`), which uses two `ISO8601DateFormatter`s both carrying `.withInternetDateTime` — so a timezone designator (`Z` or `±HH:MM`) is mandatory. Output goes through `formatISO8601`, which emits UTC with `Z`. The MCP server runs locally on the user's Mac, so it can resolve the user's timezone at startup, but today nothing in the tool surface tells the model that timezone, and the model's default naive datetime (`2026-06-13T00:00:00`) is rejected outright.

Two distinct problems fall out of this: (1) a wasted parse-error/retry roundtrip on naive input, and (2) a latent correctness gap where UTC-literal output and the user's local-timezone mental model disagree, so day-boundary windows can shift by the offset. This design covers both. The single-user, local-Mac deployment is a load-bearing assumption: server-local timezone is the user's timezone.

## Goals / Non-Goals

**Goals:**
- Accept the datetimes the model naturally produces (naive and date-only) without an error roundtrip, while still honoring explicit offsets exactly.
- Make input and output timezone-correct relative to the user's local timezone, with no silent day-boundary drift.
- Keep one authoritative parser (Swift); avoid duplicating date semantics in the TypeScript layer.
- DST-correct year-round.

**Non-Goals:**
- Supporting a server timezone that differs from the user's timezone (remote/hosted deployment). Documented assumption, not handled.
- Per-call or per-tool timezone override parameters. The local timezone is implicit.
- Changing the lean payload's field set or the occurrence-matching mechanism.

## Decisions

**1. Lenient input, explicit offset wins.** `parseISO8601` tries, in order: offset-aware formatters (exact instant), then naive `YYYY-MM-DDTHH:MM:SS[.SSS]` interpreted in `TimeZone.current`, then date-only `YYYY-MM-DD` as local midnight. Genuinely unparseable input still throws `BridgeError.invalidDate`.
- _Alternative — strict `.datetime({ offset: true })` in Zod + a `...+02:00` example in the description:_ rejected. It forces the model to compute the correct local UTC offset on every call, which is fragile across DST and contradicts the user's stated "times are always local" mental model.
- _Alternative — keep strict, only improve the description:_ rejected. Removes the parse error but leaves the timezone window-shift, because the model still has to reason in UTC.

**2. Naive/date-only fallbacks via `DateFormatter` keyed to a timezone.** Use explicit `DateFormatter`s (`yyyy-MM-dd'T'HH:mm:ss`, `…sss`, `yyyy-MM-dd`, plus `yyyy-MM-dd'T'HH:mm` — see decision 7) with `locale = en_US_POSIX` and a timezone that defaults to `.current`. DST is handled correctly because the zone resolves the offset for the given wall-clock date. `parseISO8601` and `formatISO8601` take an **injectable `zone: TimeZone = .current`** parameter — production keeps the default, tests pass an explicit non-UTC zone (e.g. `Europe/Berlin`) so they assert the offset deterministically even though CI's `TimeZone.current` is UTC (see Risks). No production behavior change; it is purely a testability seam.
- _Alternative — `ISO8601DateFormatter` with a custom `timeZone` and `.withInternetDateTime` dropped:_ rejected. Its naive-parsing behavior is finicky and less obvious; explicit `DateFormatter`s are clearer and directly unit-testable in `AppleBridgeCore`.
- _Alternative — read `TimeZone.current` directly and pin the process TZ in tests:_ rejected. `TimeZone.current` is effectively cached per process and not reliably overridable mid-run from a Swift test, so the injected-parameter seam is the deterministic option.

**3. Local-offset output.** `formatISO8601` emits the server-local offset (`2026-06-13T10:00:00+02:00`) instead of `Z`. The instant is identical, so the `occurrenceDate` round-trip into `update_event` is unaffected — `SlotMatcher` compares `Date`s within a 1 ms tolerance, never the timestamp string.
- _Alternative — keep `Z`, let the model convert for display:_ rejected. UTC→local conversion is exactly the error-prone step that produced the reported wrong-wall-clock UX.
- _Alternative — add a separate `localStartDate` field:_ rejected. Bloats the lean payload and creates two sources of truth for the same instant.

**4. Zod stays lenient; Swift is the single parse authority.** Date inputs remain `z.string()` with no format enforcement, so naive and date-only strings reach Swift. Re-encoding the parsing rules in Zod would create a second source of truth that can drift from the Swift parser.

**5. Server timezone injected into descriptions at registration.** Resolve `Intl.DateTimeFormat().resolvedOptions().timeZone` once when registering tools and interpolate it into the date-field descriptions via a shared helper, so every date-taking tool advertises the same, accurate timezone and format guidance.

**6. `find_free_slots` window canonicalized once; slots emitted with the local offset.** `find_free_slots` is the one tool that interprets its date inputs *twice*: the raw strings go to the bridge (`bridge.events`) **and** into the pure `computeFreeSlots`, which parses them with JS `new Date()`. JS `new Date()` agrees with the bridge for offset-bearing and naive-datetime inputs (both local for naive), but **disagrees on date-only**: `new Date("2026-06-13")` is **UTC** midnight while the bridge resolves date-only to **local** midnight. Under the old strict regime date-only was rejected, so this never arose; lenient input makes it a live, silent day-boundary shift (the events are fetched over `[localMidnight, …]` but the inversion window starts at `localMidnight + offset`).
- _Fix:_ canonicalize **only** the ambiguous date-only form at the handler entry — if a `startDate`/`endDate` matches `^\d{4}-\d{2}-\d{2}$`, append `T00:00:00` — and feed the *same* canonicalized strings to both `bridge.events` and `computeFreeSlots`. After canonicalization all three input shapes agree between JS and the bridge (offset→exact, naive→local, date-only→local-midnight). This deliberately does **not** re-encode the offset/naive rules in TS (which decision 4 warns against); it canonicalizes the single form on which the two parsers diverge.
- `computeFreeSlots` output moves from `Date.toISOString()` (always `Z`) to a small `formatLocalISO` helper that emits the server-local offset, **mirroring Swift**: when the local offset is zero it renders `Z` (so a UTC CI and the Swift `formatISO8601` agree), otherwise `±HH:MM`. Slot output is now consistent with event output.
- _Alternative — reject date-only for `find_free_slots` only:_ rejected. It contradicts the uniform contract ("any MCP tool accepts date-only") and makes one tool an exception the model must remember.
- _Alternative — echo the bridge's parsed window back to TS and reuse it:_ rejected as overkill; canonicalizing one regex-matched form is far simpler and needs no new bridge round-trip.

**7. Accept minute-precision datetimes without seconds.** Add a `yyyy-MM-dd'T'HH:mm` fallback (naive, local) alongside the seconds/fractional formatters. Cheap completeness: a model occasionally emits `2026-06-13T10:00`, and without this it throws `invalidDate` — the same canonical form is now accepted in both Swift and JS (`new Date("…T10:00")` is already local), keeping the two parsers aligned.

## Risks / Trade-offs

- **Wire-format change `Z` → `±HH:MM` breaks any consumer that string-matches `Z`.** → Within this project the only consumer is the model, which reads either representation; the `occurrenceDate` round-trip compares instants, not strings. Marked BREAKING in the proposal and covered by a round-trip regression test.
- **Server timezone ≠ user timezone under a remote deployment.** → Out of scope by assumption; documented in code and docs so a future hosted variant revisits it.
- **DST spring-forward gap / fall-back overlap makes a naive wall-clock time ambiguous.** → `DateFormatter` resolves it deterministically; acceptable for day-boundary range queries. Noted, not specially handled.
- **Existing tests assert `...Z`.** → Audit vitest `unit` fixtures and in-process integration assertions; extend `swift test` with the new parse/format cases (including the occurrence round-trip).
- **Format tests are timezone-dependent; CI runs in UTC.** A naive "output carries an offset, not `Z`" assertion is *false* under a UTC `TimeZone.current` (local literally is `Z`). → Make format/parse assertions deterministic via the injected `zone` parameter (decision 2): pass `Europe/Berlin` and assert `+02:00`; separately assert that a UTC zone renders `Z`. The TZ-agnostic contract (round-trip `parse(format(d)) == d`, and naive-input resolves to the `.current`-derived instant) holds in any environment. Vitest free-slot output is asserted on the parsed instant (and a dedicated `formatLocalISO` unit test injects the offset) so it is CI-stable too.
- **`find_free_slots` double-parses its window (JS `new Date` ≠ bridge for date-only).** → Canonicalize the date-only form once and feed both paths the same string; emit slots through `formatLocalISO` (decision 6). Covered by a unit test asserting the date-only window matches the events window and that slots carry the local offset.

## Migration Plan

Pure code change — no persisted state, no data migration. Deploy by rebuilding the Swift bridge and TypeScript (`./scripts/build.sh`). Rollback is a straight revert; old and new binaries can each parse their own output, and `update_event` matches on instant so a mixed-version round-trip still resolves.

## Open Questions

- Fractional seconds on output: keep the current `.withFractionalSeconds` (now alongside the local offset) or drop them for readability? Default: keep, to limit churn to the timezone change alone.
