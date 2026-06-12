## Context

The server is a two-layer MCP integration (TypeScript MCP layer → Swift
`apple-bridge` CLI → EventKit). Six tools are exposed; results come back as a
JSON envelope, are parsed in `swift.ts`, and re-serialized by `wrap()` in
`calendar.ts` as pretty-printed text. This change tunes the surface for a
low-overhead personal assistant: leaner payloads, honest annotations, two new
capabilities (free-slot search, recurrence creation), and removal of the
redundant `get_today_events`. It is cross-cutting (TS + Swift + tests + docs) and
includes a breaking removal, so the technical choices are worth fixing here
before implementation.

The layered test suite this builds on is already merged
(`add-layered-test-suite`, commit `6bd6a1f`); its structure is final. The tasks
here scope test edits to the schema/arg-builder/integration files this change
owns, and they update the merged contract/integration assertions that pin the
current 6-tool surface.

## Goals / Non-Goals

**Goals:**

- Cut tokens per event read (~40–50%) without losing any field the client acts on.
- Make read/write intent explicit via MCP annotations + titles (spec 2025-11-25).
- Add `find_free_slots` (TS-only) and recurrence creation (Swift `EKRecurrenceRule`).
- Remove `get_today_events`.
- Keep recurring-update correctness intact (the project's core value).

**Non-Goals:**

- No `delete_event` (explicitly deferred).
- No `outputSchema`/`structuredContent` — these are valid in spec 2025-11-25 and
  the SDK; we skip them as a deliberate scope choice (schema-maintenance overhead
  with no payoff at this scale), not because clients break on them.
- No persistent daemon; process-spawn-per-call stays.
- No Swift work for free-slot search; no free/busy EventKit query.
- No `response_format: concise|detailed` parameter — a single lean default is
  enough for this scale; adding a verbosity knob would be premature.
- No monthly/yearly by-weekday recurrence (e.g. "2nd Tuesday") — `daysOfWeek` is
  scoped to `weekly` for V1 (see decision 4).

## Decisions

**1. Where to make the payload lean: in `swift.ts`, at the bridge boundary.**
The Swift binary keeps emitting all fields (its envelope is also used by the CLI
and internal matching uses `externalId`). The TS `events()`/`createEvent()`/
`updateEvent()` mappers strip the event to the lean shape before it reaches
`wrap()`, and `wrap()` switches to `JSON.stringify(data)` (no indentation).
`wrap()` is shared by all tools, so compacting it also makes `get_calendars` and
`find_free_slots` output compact — intended (leaner everywhere, one source of
truth), not a per-tool change. Alternatives: stripping in Swift (rejected —
breaks CLI parity and internal `externalId` use) or stripping inside each tool
handler (rejected — duplicated across tools; a single mapper in `swift.ts` is the
one source of truth).

**2. Lean shape rule: omit null, never emit `isDetached`/`externalId`.** A field
is present iff it has a value; `isAllDay`/`hasRecurrenceRules` are always present
(never null). This is predictable for the model ("absent = not set") and avoids a
per-field allow/deny list drifting out of sync. `externalId` is dropped from the
client payload only; Swift's occurrence matching (`eventIdentifier` OR
`calendarItemExternalIdentifier`) is untouched.

**3. `find_free_slots` is pure TypeScript over `get_events` data.** It fetches
events in the window via the existing bridge call, treats timed events as busy,
and computes free gaps with explicit interval semantics: **clip** every busy
event to the `[startDate, endDate]` window (an event straddling a boundary blocks
only its in-window portion), **drop zero-length** events (start == end), **merge**
overlapping *and* touching/back-to-back busy intervals into one block, invert
within the window, optionally clip to working hours per day, optionally filter
busy events by calendar, and drop gaps below the minimum duration. All-day events
are treated as non-blocking (they don't occupy timed availability — e.g. a
birthday shouldn't make a day look booked).

**Timezone:** there is no `timezone` parameter. Working hours and day boundaries
are interpreted in the **server's local timezone** (which, for this single-user
personal server, is the user's own machine) — the same convention as
`getDefaultSearchWindow()` in `calendar.ts`. DST transition days are a documented
known edge (a local day may be 23 h or 25 h; slots are still derived from real
instants, so no slot is invented, but working-hours clipping on the transition
day may shift by an hour). An event's own `timeZone` field does not change how its
busy block is clipped — busy intervals are compared as absolute instants.

Alternative: EventKit free/busy in Swift (rejected — new Swift surface, TCC
nuance, and no added correctness over interval math on data we already fetch).

**4. Recurrence creation lives in Swift via `EKRecurrenceRule`.** The TS
`recurrence` object is validated with Zod (frequency enum; `interval` ≥ 1;
`endDate` XOR `occurrenceCount`; optional `daysOfWeek`) and passed through new CLI
flags to `create-event`. Swift builds `EKRecurrenceRule(recurrenceWith:interval:
daysOfTheWeek:...:end:)`. The `endDate`-vs-`occurrenceCount` exclusivity is
enforced in Zod via a `superRefine()` **co-located in `createEventInput`**
(alongside the other cross-field rules, exactly like `updateEventSchema`) and
re-checked in Swift (authoritative, CLI-callable) — one discoverable source per
layer, mirroring the existing `update_event` split.

`daysOfWeek` is a list of two-letter weekday codes (`MO`/`TU`/`WE`/`TH`/`FR`/
`SA`/`SU`) and is **scoped to `frequency: weekly` for V1**: Zod rejects it for
other frequencies. `EKRecurrenceRule` could also express monthly/yearly
by-weekday patterns ("2nd Tuesday"), but the day-of-month / set-position surface
that needs is deliberately out of scope here; this is a documented V1 limit, not
an oversight, and can be a follow-up change if a real need appears.

**5. Annotations as a registration concern.** Add `annotations: { readOnlyHint }`
to each `registerTool` call, plus `destructiveHint: true` on `update_event` (it
overwrites prior event state) and `destructiveHint: false` on `create_event`
(additive). The `false` is set **explicitly**, not omitted: per MCP spec
2025-11-25 `destructiveHint` defaults to `true` when `readOnlyHint` is `false`,
so an omitted hint would make a spec-compliant client treat the additive create
as destructive — the opposite of the intent. `idempotentHint`/`openWorldHint`
are not applicable to a calendar write. `title` is placed at the **top level** of
each `registerTool` config (it propagates to `Tool.title`), not inside
`annotations`. No security weight is placed on the hints — they are UX signals;
the real safety lever remains the absent delete tool.

**6. `get_today_events` removal.** Drop the tool registration, the
`bridge.today()` method, and the Swift `today` subcommand path is left in place
only if the CLI still needs it for manual use — otherwise removed for parity.
Decision: remove the `today()` TS method and tool; leave the Swift `today`
subcommand (harmless, used in manual smoke/docs) to avoid churn, but stop calling
it from the server.

## Risks / Trade-offs

- **Breaking removal of `get_today_events`** → personal/local server, single
  known consumer; migration is a trivial `get_events` one-day range, documented in
  the spec delta and README.
- **Omitting null fields changes the shape the model sees** → predictable rule
  ("absent = not set"); identity/boolean fields stay always-present so the model
  never has to guess about `isAllDay`.
- **All-day = non-busy is a policy choice** → matches assistant intuition; if a
  user wants all-day events to block, that is a future opt-in flag, not this
  change. Documented in the `availability` spec.
- **Recurrence validation drift between Zod and Swift** → keep both, with the
  same rules and matching error wording, exactly as `update_event` already does.
- **Sibling `add-layered-test-suite` already merged** → no coordination needed;
  confine edits to `test/calendar.schema.test.ts`, the arg-builder tests, the
  in-process MCP integration test, and `test/fixtures/fake-bridge.mjs`, all of
  which this change owns.
- **Dropping `externalId` could regress occurrence matching if done in the wrong
  layer** → strip only in the TS client-facing mapper; add a regression scenario
  (tool-conventions) asserting recurring update still resolves after the change.
- **All-day `endDate` is EventKit's exclusive end** (a one-day all-day event on
  2026-02-01 reports `endDate` 2026-02-02T00:00:00Z) → it stays always-present and
  is returned verbatim, so a client can round-trip it back into `update_event`
  unchanged.
- **Omitting null `occurrenceDate` for non-recurring events** → harmless: `span`
  defaults to `this`, and `span: future` already requires `occurrenceDate` and is
  rejected for non-recurring events; the `update_event` description states this so
  "absent" is never read as "not required".
