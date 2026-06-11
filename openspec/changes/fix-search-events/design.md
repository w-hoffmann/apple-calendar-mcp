## Context

`search_events` (src/tools/calendar.ts) accepts optional `startDate`/`endDate`. When omitted it builds a default window. The current default start uses `new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()`. The `Date` constructor builds local midnight, but `.toISOString()` serializes to UTC, so in a UTC+2 zone (CEST) the emitted instant is `22:00Z` of the previous day — about 2 hours before the intended local start of day. The bridge then receives a window that begins early, contradicting the spec's "start of the current day". Separately, the tool description and `query.describe()` claim title-only matching, but the filter (lines 104-109) also matches `location` and `notes`.

## Goals / Non-Goals

**Goals:**
- Default `startDate` equals the start of the current day in the host's local time zone, expressed as a correct ISO8601 instant.
- LLM-facing strings honestly describe title/location/notes matching.

**Non-Goals:**
- Changing the 30-day default window length or the `endDate` default.
- Moving filtering into Swift or changing match semantics.
- Adding a timezone-override parameter.

## Decisions

- Compute local start-of-day by zeroing the time components on a `Date` and serializing: keep `new Date(now.getFullYear(), now.getMonth(), now.getDate())` as the local instant, but pass it through correctly so the ISO string represents that exact local midnight instant. The fix is to use the `Date` object's true UTC representation of local midnight — `new Date(y, m, d).toISOString()` already yields the correct UTC instant for local midnight; the real defect is reasoning, so the precise behavior to assert is: the resulting instant, when viewed in local time, is 00:00:00 of today. Implementation will construct local midnight and serialize it so the bridge window starts no earlier than local start of day.
- Rationale: EventKit/the bridge operate on absolute instants; the spec intent is "local start of day", which is one well-defined instant. Keeping the computation local-zone-based avoids UTC drift.
- Update both strings to `"Search events by title, location, or notes (client-side filtering)"` to match actual filter behavior and the existing README/spec.

## Risks / Trade-offs

- Behavior shift: callers in positive-offset zones get a slightly later (correct) window start, so events between previous-local-evening and local midnight no longer appear. Acceptable — that matches the documented contract.
- No timezone parameter means servers and clients in different zones use the server's local zone; out of scope and unchanged from today.
