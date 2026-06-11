# Design

## Context

`update_event` exposes `eventId`, `span`, `occurrenceDate` plus eight optional
mutable fields. The Zod schema accepts a call with only `eventId`, which then
flows through the bridge to `store.save` — a write that changes nothing yet
mutates last-modified metadata and contradicts the tool's "only fields you pass
are changed" contract. The other three items are pure refactors with no behavior
change: a dead `#available` branch, repeated try/catch boilerplate in 6 tools,
and an uncapped `execa` output buffer.

## Goals / Non-Goals

**Goals:**
- Make a no-mutable-field `update_event` call fail fast with a clear validation
  error, before any bridge invocation.
- Remove duplication (Swift switch, TS try/catch) without changing behavior.
- Bound the bridge output buffer to a sane size.

**Non-Goals:**
- No change to the bridge protocol, JSON envelope, or any Swift subcommand
  argument surface.
- No change to which fields are mutable or how partial updates apply.

## Decisions

- **Validate in Zod via `.superRefine`**, not in the handler body, so the
  rejection happens during argument parsing and surfaces as a standard
  validation error before `bridge.updateEvent` is reached. The refine requires at
  least one of `title`, `startDate`, `endDate`, `timeZone`, `allDay`, `location`,
  `notes`, `calendarId`.
- **`wrap(fn)` helper** takes an async producer returning the success payload and
  returns `{ content, isError }`; on throw it returns the error envelope. Each
  tool handler becomes a one-liner body. This keeps the existing behavior
  (success serializes JSON with 2-space indent; errors return `String(e)` with
  `isError: true`).
- **Single Swift switch**: drop the `if #available(macOS 14.0, *)` wrapper in
  `accessStatus()`; `EKEventStore.authorizationStatus(for:)` and the
  `.fullAccess`/`.writeOnly` cases compile fine under the project's deployment
  target, and the two branches were byte-identical anyway.
- **`maxBuffer: 10 * 1024 * 1024`** on the execa options — calendar JSON is tiny;
  10MB is generous headroom while replacing the 100MB default.

## Risks / Trade-offs

- A client that previously relied on a no-op `update_event` succeeding will now
  get a validation error — this is the intended, documented behavior change.
- `maxBuffer` could in theory truncate an enormous event range; 10MB is far above
  any realistic calendar JSON payload, so the trade-off is acceptable.

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
- **Suggested apply order:** `bridge-robustness` → `harden-recurring-update` →
  `code-cleanup`. No hard correctness dependency exists, but `bridge-robustness`'s
  `eventToInfo` nil-`eventIdentifier` guard should land before
  `harden-recurring-update`, whose specific-occurrence detach makes that nil
  return path reachable — otherwise even `harden`'s own smoke test could hit the
  force-unwrap crash. `code-cleanup` goes last so its `wrap(fn)` refactor and
  no-op refine layer over the final schema and handler bodies. Alternatively, fold
  the shared `update_event` / `updateEvent` / `Models` edits into one apply pass.
