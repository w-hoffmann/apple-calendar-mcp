# Fix search_events defaults

## Why

`search_events` computes its default start-of-day window via `new Date(y, m, d).toISOString()`, which serializes local midnight to UTC and starts the window early in positive-offset zones; its tool/parameter descriptions also claim title-only matching while the code matches title, location, and notes.

## What Changes

- Fix the default `startDate` in `search_events` so it is the timezone-accurate start of the current local day (currently starts ~2h early in zones like CEST).
- Update the `search_events` tool description and `query` parameter `.describe()` to state matching against title, location, or notes (client-side filtering).

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `event-querying`: Make the "Default search window" scenario of the "Search events by text" requirement precise about local-time-zone start of day.

## Impact

- `src/tools/calendar.ts` (lines 79, 81, 93-95)
- `openspec/specs/event-querying/spec.md` (at archive)
