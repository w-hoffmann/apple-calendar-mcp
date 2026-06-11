# Fix search_events field-matching documentation

## Why

`search_events` filters client-side against each event's title, location, **and**
notes (case-insensitive substring), but the tool `description` and the `query`
parameter `.describe()` both claim title-only matching. The strings mislead the
LLM client — a location/notes search looks unsupported even though it works — and
contradict the `event-querying` spec, which already mandates title/location/notes
matching. The code, not the spec, is out of conformance.

> Note: the default search-window computation was previously suspected of a
> timezone bug ("starts ~2h early in CEST"). It is **not** buggy.
> `new Date(y, m, d).toISOString()` already yields the exact local-midnight
> instant (the constructor uses local components; `.toISOString()` serializes
> that same instant to UTC). The correctness is subtle, so we lock it with a
> comment and a unit test rather than "fix" working code.

## What Changes

- Update the `search_events` tool `description` and `query` `.describe()` to state
  matching against title, location, or notes (client-side substring filtering).
- Extract the default-window computation into an exported, unit-tested pure helper
  `getDefaultSearchWindow()` with a comment that prevents a regressive
  UTC-midnight "simplification". **No behavior change.**

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `event-querying`: Add a "Tool advertises matched fields" scenario to the
  "Search events by text" requirement so the tool/parameter descriptions are
  contractually required to name title, location, and notes.

## Impact

- `src/tools/calendar.ts` — `searchEventsInput.query` `.describe` (~L31-36),
  new `getDefaultSearchWindow()` helper (~L121), `search_events` tool
  `description` + handler (~L174-195)
- `test/calendar.schema.test.ts` — default-window + discoverability tests
- `openspec/specs/event-querying/spec.md` (at archive)
