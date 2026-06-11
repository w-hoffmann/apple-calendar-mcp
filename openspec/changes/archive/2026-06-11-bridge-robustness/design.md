## Context

The Swift bridge is the trust boundary for EventKit. Several inputs that should be rejected with a clean JSON-envelope error currently either crash (a nil `eventIdentifier` reaching the non-optional `EventInfo.id`), are silently dropped (`create_event` ignoring an invalid `timeZone`), or reach `store.save` and surface as an opaque EventKit error (`start >= end`). The fixes are small and local; no architectural change.

## Goals / Non-Goals

**Goals:**
- Never crash the bridge on a nil event identifier.
- Reject invalid inputs with a clear, accurate error message at the bridge boundary, consistently between create and update.

**Non-Goals:**
- No new tools, no schema/argument additions beyond validation.
- No revalidation of fields EventKit already validates adequately (e.g. calendar existence).
- No title trimming or whitespace policy beyond "non-empty" (matches Zod `.min(1)` semantics).

## Decisions

- **Guard the identifier, don't propagate optionality.** `EKEvent.eventIdentifier` is an implicitly-unwrapped optional (`String!`); assigning it to the non-optional `EventInfo.id` implicitly force-unwraps and traps on nil. Use `event.eventIdentifier ?? ""` in `eventToInfo` so the DTO stays non-optional and callers are unaffected; an empty `id` is acceptable for a freshly detached occurrence return value.
- **Validate time zone the same way in both paths.** `createEvent` constructs `TimeZone(identifier:)` and throws on `nil`, matching `updateEvent`. The error uses a new `BridgeError.invalidTimeZone(String)` so the message is accurate rather than reusing `invalidDate` (whose prefix is `Invalid ISO8601 date:`).
- **Check `start < end` before `store.save` in both `createEvent` and `updateEvent`.** Independent start/end application (update) or a caller mistake (create) can produce an inverted range; an explicit pre-save check yields a clear message instead of an opaque EventKit save error. In `updateEvent` the check compares the event's final `startDate`/`endDate`, not just the provided params, so a partial update that inverts against an existing value is also caught. `create_event` is the more likely inverted-range case, so parity matters.
- **Reject unknown `--span` and conflicting all-day flags in `main.swift`.** Map `--span` only to `{this, future}` and error otherwise instead of defaulting to `.thisEvent`; treat `--all-day` together with `--no-all-day` as an error instead of silently resolving to `true`.
- **Empty title guarded in both layers.** Zod `.min(1)` rejects an empty title on the MCP path without a bridge round-trip. `createEvent` (always) and `updateEvent` (when a title is supplied) also reject an empty title at the Swift bridge, so the trust boundary holds for direct-CLI callers — consistent with the other four validations, which all live in Swift.

## Risks / Trade-offs

- An empty `id` in a returned `EventInfo` is unusual but only occurs for a just-detached occurrence; consumers already treat the returned event as informational. Acceptable.
- Empty-title validation is duplicated (TS `.min(1)` + Swift guard). The redundancy is intentional defense in depth: TS avoids a needless bridge round-trip, Swift holds the trust boundary. Both use the same "non-empty" rule, so they cannot disagree.

## Cross-change coherence

Three in-progress changes — `harden-recurring-update`, `code-cleanup`, and
`bridge-robustness` — edit the same `update_event` surfaces and must compose into
one coherent result rather than clobber or reorder each other.

- **Shared edit surfaces:** `src/tools/calendar.ts` — the `update_event` Zod
  schema, and its handler body (which `code-cleanup` rewrites via the `wrap(fn)`
  helper); `swift/Sources/AppleBridge/CalendarService.swift` — `updateEvent`,
  plus `eventToInfo`; `swift/Sources/AppleBridge/Models.swift` — the `BridgeError`
  enum and its exhaustive `description` switch.
- **TypeScript — compose, don't replace.** The `update_event` schema accumulates
  three rules of two kinds. `bridge-robustness`'s non-empty `title` is a
  *field-level* `.min(1)` modifier and composes trivially under any ordering. The
  other two are *cross-field* rules — at least one mutable field (`code-cleanup`)
  and `span: "future"` ⇒ `occurrenceDate` (`harden-recurring-update`) — and the
  schema currently has **no** `superRefine`/`refine` at all. So the first of those
  two to apply must introduce the `z.object({...}).superRefine(...)` wrapper, and
  the second must extend that same wrapper rather than re-wrap; `code-cleanup`'s
  `wrap(fn)` refactor must preserve both. This cross-field coordination is the only
  real composition risk, and it lies between `code-cleanup` and
  `harden-recurring-update`, not with `bridge-robustness`.
- **Swift `BridgeError` — merge cases, one switch.** `harden-recurring-update`
  adds `recurringRequiresOccurrenceDate`, `spanFutureRequiresOccurrenceDate`,
  `occurrenceNotFound`; `bridge-robustness` adds `invalidTimeZone` and a generic
  `invalidInput(String)` (carrying the message verbatim) for the empty-title,
  `start >= end`, unknown-span, and conflicting-all-day rejections. All land in
  the single enum and its one exhaustive `description` switch. Additive, no
  collision.
- **Swift `updateEvent` guard order:** (1) `span: "future"` ⇒ `occurrenceDate`
  and recurring ⇒ `occurrenceDate` guards (`harden-recurring-update`, around
  event resolution); (2) occurrence-not-found descriptive error
  (`harden-recurring-update`); (3) invalid-time-zone, `start >= end`, and
  empty-title checks before `store.save` (`bridge-robustness`). These touch
  disjoint regions of the function, so the layering is physically coherent.
- **`eventToInfo` nil-identifier guard is independent.** `EKEvent.eventIdentifier`
  can already be nil today for an occurrence resolved via the `predicateForEvents`
  window (the `occurrenceDate` path), so the guard stands on its own — it does not
  depend on `harden-recurring-update` (which adds no per-occurrence detachment;
  that is an explicit non-goal of that change). Only one change edits `eventToInfo`,
  so there is no collision.
- **Suggested apply order:** `bridge-robustness` → `harden-recurring-update` →
  `code-cleanup`. No hard correctness dependency exists. `bridge-robustness` is the
  safe first step because it introduces no `superRefine` wrapper and no cross-field
  rule, so it cannot collide with the others. `code-cleanup` goes last so its
  `wrap(fn)` refactor and "at least one mutable field" refine layer over the final
  schema and handler bodies. Alternatively, fold the shared `update_event` /
  `updateEvent` / `Models` edits into one apply pass.
