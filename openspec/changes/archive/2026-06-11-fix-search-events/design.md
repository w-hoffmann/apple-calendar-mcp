## Context

`search_events` (src/tools/calendar.ts) filters events client-side, matching the
query against each event's `title`, `location`, and `notes` (case-insensitive
substring, see the handler's `events.filter(...)`). However, the tool
`description` and the `query` parameter `.describe()` both claim **title-only**
matching. This misleads the LLM client (a location/notes search looks
unsupported though it works) and contradicts the `event-querying` spec, which
already mandates title/location/notes matching.

Separately, when `startDate`/`endDate` are omitted, the default window starts at
`new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()`. This
is the **correct** local-start-of-day instant: the `Date` constructor uses local
components (local midnight) and `.toISOString()` serializes that exact instant to
UTC (e.g. local 00:00 CEST → 22:00Z the prior day, which reads back as 00:00
local). The correctness is subtle and an easy target for a regressive
"simplification" to UTC midnight — but the current code is not buggy.

## Goals / Non-Goals

**Goals:**
- Tool/parameter descriptions honestly state title/location/notes matching.
- Lock the (already correct) local-start-of-day default against future regression.

**Non-Goals:**
- Changing match semantics, the 30-day window length, or moving filtering into Swift.
- Adding a timezone-override parameter.
- Any runtime behavior change — this change is documentation + test hardening only.

## Decisions

- **Update both LLM-facing strings** to name title, location, and notes. The spec
  already mandates this behavior, so the code is brought into conformance with it
  (no spec behavior change).
- **Extract `getDefaultSearchWindow()`** as an exported pure helper and cover it
  with a timezone-agnostic unit test (`getHours()/getMinutes()/getSeconds()` of
  the start read 0 in the host's local zone, so local midnight passes regardless
  of UTC offset). A comment on the helper warns against replacing local midnight
  with UTC midnight (`setUTCHours(0,…)` / `new Date("YYYY-MM-DD")`), which would
  start the window at local 02:00 in CEST and drop early-morning events.
  Rationale: the correctness is non-obvious; a test + comment are cheap, match the
  project's pure-unit-test convention, and pin the contract under CI.
- **Spec:** add a "Tool advertises matched fields" scenario (the discoverability
  contract the code was violating). Do **not** add a "local midnight" spec clause —
  the behavior is already correct, and a spec assertion there would canonize a fix
  that never happened.

## Risks / Trade-offs

- No runtime risk: strings plus an extracted (behaviorally identical) helper only;
  all existing and new unit tests pass.
- The discoverability scenario couples the spec to description wording. Kept loose
  — descriptions must *name* the three fields, not match exact text — so minor copy
  edits don't break the contract.
