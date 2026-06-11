## Context

`CalendarService.updateEvent` (swift/Sources/AppleBridge/CalendarService.swift ~159-209) resolves the target event two ways: with `occurrenceDate` it searches a one-day predicate window and takes the first matching event; without it, it calls `store.event(withIdentifier:)`, which returns the series master (first occurrence) for a recurring event. `store.save(_, span:)` then applies the edit to that resolved `EKEvent`: span `.thisEvent` edits the first occurrence, span `.futureEvents` rewrites the series. Because `update_event` exposes `occurrenceDate` as optional and frames itself as a reschedule tool, the obvious call silently hits the wrong instance.

`get_events` emits `EventInfo.occurrenceDate = formatISO8601(event.occurrenceDate)` — the EventKit `EKEvent.occurrenceDate` property, which is the occurrence's original series slot and the stable key identifying which instance an `EKEvent` is. It stays pinned to the original slot even when the occurrence is detached and its `startDate` is moved. The client passes that exact value back into `update_event` as `occurrenceDate`.

## Goals / Non-Goals

**Goals:**
- Make the dangerous path explicit: refuse a recurring update without `occurrenceDate` and tell the caller exactly what to pass.
- Require `occurrenceDate` for `span: "future"` at both the TS and the Swift/CLI boundaries.
- Match the occurrence by its `occurrenceDate` (the value `get_events` emits) so sub-daily and detached/moved occurrences are unambiguous.
- Return a descriptive, recoverable error when a supplied `occurrenceDate` matches no occurrence.
- Clarify in the tool surface that `occurrenceDate` is the occurrence's series-slot identifier, not the new time.

## Non-Goals

- Adding per-occurrence detachment/exception semantics beyond EventKit's existing `EKSpan`.
- Changing non-recurring update behavior (single events still update with just `eventId`).
- Adding a delete capability.
- Re-targeting an occurrence whose `startDate` has already been moved **outside** the `occurrenceDate`-anchored day window (see Risks); such a call surfaces the descriptive occurrence-not-found error rather than silently doing nothing.

## Decisions

- **Reject in Swift, not only TS.** The Swift guards are the authoritative safety net since the bridge is callable directly via CLI. Two guards in `updateEvent`:
  1. `occurrenceDate == nil && span == .futureEvents` → `spanFutureRequiresOccurrenceDate`. Placed before resolving the event so a direct `apple-bridge update-event --span future` (no `--occurrence`) cannot resolve the series master and rewrite the whole series. This mirrors the TS rule at the bridge.
  2. After resolving `ev`: `ev.hasRecurrenceRules && occurrenceDate == nil` → `recurringRequiresOccurrenceDate` (covers span `this`/default on a recurring series; only reachable in the `occurrenceDate == nil` branch, where `ev` is the series master).
  Both messages instruct the caller to pass `occurrenceDate` taken from `get_events.occurrenceDate`. **No `main.swift` change is needed** — the guards live in `CalendarService.updateEvent`, which the CLI subcommand also invokes.
- **Defense in depth in TS.** A Zod `superRefine` on `update_event` rejects `span: "future"` without `occurrenceDate` before the bridge call, giving a fast, structured validation error. The recurring-without-`occurrenceDate` case for span `this`/default is caught by Swift (TS cannot know an event is recurring without a round-trip). **Structure:** `updateEventInput` stays a raw Zod shape (so the other tools and the unit tests keep using `z.object(updateEventInput)`); the refined schema is built once as `export const updateEventSchema = z.object(updateEventInput).superRefine(rule)`. The tool is registered with the **raw `updateEventInput` shape** as `inputSchema`, and the refine is enforced **in the handler** (`updateEventSchema.safeParse(args)`). Reason (verified against the pinned `@modelcontextprotocol/sdk` 1.26.0 + Zod 3.25, v3 surface): the SDK advertises a tool's input JSON Schema by reading `.shape`, which a `ZodEffects` (`.superRefine`) does **not** expose — passing `updateEventSchema` directly as `inputSchema` advertises an **empty** schema (no `eventId`/`occurrenceDate`/field docs). Registering the raw shape keeps all properties advertised, while the handler refine still gives a fast, structured `span: "future"` rejection before the bridge call. Stays on the Zod v3 surface (`superRefine` is current); no `zod/v4` migration. (The handler refine also remains the single merge point for sibling changes — see "Cross-change coherence".)
- **Match on `occurrenceDate`, with tolerance.** In the predicate-window branch, select the event whose `occurrenceDate` equals the supplied value **and** whose id matches, instead of `events.first`. Match on `EKEvent.occurrenceDate`, **not** `startDate`: `get_events` emits `occurrenceDate`, so the lookup must compare the same field; for a detached/moved occurrence `startDate` has moved away from the supplied value while `occurrenceDate` stays pinned (verified against Apple's EventKit docs). Use a **millisecond-scale tolerance matching the serialization granularity** — `abs(od.timeIntervalSince(occ)) < 0.001` (`EKEvent.occurrenceDate` is a `null_unspecified Date!` (IUO) that is reliably non-nil for store-predicate results since they always carry a `startDate`; the matcher binds it with `guard let od = $0.occurrenceDate` rather than force-unwrapping, and `eventToInfo` maps over it so a nil slot serializes as null) — because `get_events` formats with `.withFractionalSeconds` (millisecond precision) while the live `EKEvent.occurrenceDate` is full Double precision, so the supplied value is quantized to ≤0.5 ms off the true instant and exact `Date ==` is fragile after the round-trip. A 1 ms epsilon absorbs that quantization while staying far tighter than any real occurrence spacing; a coarse 1 s window is avoided because it could alias two genuinely near-adjacent occurrences of a sub-daily synced series (EventKit's own `EKRecurrenceRule` is daily-or-coarser, but synced calendars can expose hourly/minutely series).
- **Descriptive occurrence-not-found.** When `occurrenceDate` is supplied but no predicate result matches, determine whether the target is recurring three ways: (1) the window results matched by **either** id form (`eventIdentifier` or `calendarItemExternalIdentifier`); (2) `store.event(withIdentifier: eventId)?.hasRecurrenceRules` for the canonical id; (3) `store.calendarItems(withExternalIdentifier: eventId)` (any `EKEvent` with `hasRecurrenceRules`) for the external-id form, which `store.event(withIdentifier:)` does **not** resolve. If recurring, throw `occurrenceNotFound` whose message tells the caller the `occurrenceDate` must equal the exact `get_events.occurrenceDate`, instead of a bare `eventNotFound`. (Non-recurring → `eventNotFound` as before.) Branches (1) and (3) keep the descriptive error reachable for external-id callers — branch (1) when the occurrence is still in the window, branch (3) when it has moved outside it. This keeps the recovery message reachable in the common "stale / imprecise `occurrenceDate`" failure mode, which otherwise resolves to a misleading "event not found".

## Risks / Trade-offs

- **Behavior change for existing callers** relying on the old silent-first-occurrence path: now an error. Acceptable — the old behavior was a footgun; the error is recoverable and tells the caller how to fix the call.
- **Matching depends on `occurrenceDate` precision.** Callers pass the value from `get_events.occurrenceDate`; the ~1 ms tolerance absorbs the millisecond quantization of re-serialization while remaining far below the spacing of any real series (native EventKit recurrences are daily-or-coarser; even hourly/minutely synced series are seconds-to-minutes apart). A grossly wrong value yields the descriptive occurrence-not-found error.
- **Already-moved occurrences.** A detached occurrence whose `startDate` was dragged outside the `occurrenceDate`-anchored day window will not appear in the predicate window, so re-targeting it returns the descriptive occurrence-not-found (the recurrence check resolves the series by canonical id via `store.event(withIdentifier:)` or by external id via `store.calendarItems(withExternalIdentifier:)`, so the helpful message is reached for **both** id forms). Actually re-targeting such an occurrence remains out of scope (Non-Goals); uncommon for a 1–10-person team. Widening the window is deferred unless a real need arises.
- **All-day recurring occurrences.** Matching uses the same `occurrenceDate` instant on both sides (same property, same formatter), so all-day series resolve consistently; the one-day window is built with `Calendar.current.date(byAdding: .day, value: 1, …)`, which is DST-safe. No separate calendar-day branch is added (avoids overengineering); the tolerance covers normal cases. A short code comment at the lookup records that all-day occurrences match on the same midnight instant, and the existing `updateEvent` save path leaves an occurrence's `timeZone` untouched unless the caller passes a new one — so an all-day/DST occurrence keeps its slot. This was verified **manually** against an all-day recurring series during task 3.2 (the automated `scripts/smoke.sh` / CI only run the access-independent validation paths; the recurring/all-day occurrence checks need live calendar access and a recurring series, so they remain manual per CLAUDE.md).

## Cross-change coherence

Three sibling changes — `harden-recurring-update`, `code-cleanup`, and
`bridge-robustness` — edit the same `update_event` surfaces and must compose into
one coherent result rather than clobber or reorder each other.
`bridge-robustness` is **already archived** (2026-06-11): its `.min(1)` title
rule, `invalidTimeZone`, the `start >= end` check, and the `eventToInfo`
nil-identifier guard are live in the codebase. The remaining ordering is
therefore just `harden-recurring-update` → `code-cleanup`.

- **Shared edit surfaces:** `src/tools/calendar.ts` — the `update_event` Zod
  schema, and its handler body (which `code-cleanup` rewrites via the `wrap(fn)`
  helper); `swift/Sources/AppleBridge/CalendarService.swift` — `updateEvent`,
  plus `eventToInfo`; `swift/Sources/AppleBridge/Models.swift` — the `BridgeError`
  enum and its exhaustive `description` switch.
- **TypeScript — compose, don't replace.** The `update_event` schema accumulates
  three independent rules: at least one mutable field (`code-cleanup`),
  `span: "future"` ⇒ `occurrenceDate` (`harden-recurring-update`), and non-empty
  `title` via `.min(1)` (`bridge-robustness`). Whichever change is applied later
  merges its rule into the existing schema/`superRefine`; `code-cleanup`'s
  `wrap(fn)` refactor must preserve the others' schema additions.
- **Swift `BridgeError` — merge cases, one switch.** `harden-recurring-update`
  adds `recurringRequiresOccurrenceDate`, `spanFutureRequiresOccurrenceDate`,
  `occurrenceNotFound`; `bridge-robustness` adds `invalidTimeZone`. All land in
  the single enum and its one exhaustive `description` switch.
- **Swift `updateEvent` guard order:** (1) `span: "future"` ⇒ `occurrenceDate`
  and recurring ⇒ `occurrenceDate` guards (`harden-recurring-update`, around
  event resolution); (2) occurrence-not-found descriptive error
  (`harden-recurring-update`); (3) invalid-time-zone and `start >= end` checks
  before `store.save` (`bridge-robustness`). `bridge-robustness`'s `eventToInfo`
  nil-identifier guard is the companion to `harden-recurring-update` returning a
  possibly-detached occurrence.
- **Suggested apply order:** `bridge-robustness` (done, archived) →
  `harden-recurring-update` → `code-cleanup`. No hard correctness dependency
  remains now that `bridge-robustness` has landed: its `eventToInfo`
  nil-`eventIdentifier` guard — needed before `harden-recurring-update`, whose
  specific-occurrence detach makes that nil return path reachable, otherwise even
  `harden`'s own smoke test could hit the force-unwrap crash — is already in the
  codebase. `code-cleanup` goes last so its no-op refine **merges into** the
  `superRefine` that `harden-recurring-update` establishes (see `code-cleanup`
  task 1.1), layering over the final schema and handler bodies.
