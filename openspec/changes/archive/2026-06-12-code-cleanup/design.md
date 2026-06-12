# Design

## Context

`update_event` exposes `eventId`, `span`, `occurrenceDate` plus eight optional
mutable fields. The Zod schema accepts a call with only `eventId`, which then
flows through the bridge to `store.save` — a write that changes nothing yet
mutates last-modified metadata and contradicts the tool's "only fields you pass
are changed" contract. Separately, the `execa` bridge call relies on an uncapped
(100MB default) output buffer.

## Goals / Non-Goals

**Goals:**
- Make a no-mutable-field `update_event` call fail fast with a clear validation
  error, before any bridge invocation.
- Bound the bridge output buffer to a sane size.

**Non-Goals:**
- No change to the bridge protocol, JSON envelope, or any Swift subcommand
  argument surface.
- No change to which fields are mutable or how partial updates apply.

## Decisions

- **Merge the rule into `updateEventSchema`'s existing `.superRefine`** in
  `src/tools/calendar.ts`. That schema already carries the `span: "future"` ⇒
  `occurrenceDate` rule and is enforced in the tool handler via
  `updateEventSchema.safeParse(args)` — the pinned @modelcontextprotocol/sdk
  1.26.0 advertises a tool's input JSON Schema from `.shape`, which a `ZodEffects`
  (`.superRefine`) does not expose, so the raw `updateEventInput` shape stays the
  advertised `inputSchema`. Adding a second `ctx.addIssue` to the same refine —
  requiring at least one of `title`, `startDate`, `endDate`, `timeZone`,
  `allDay`, `location`, `notes`, `calendarId` — makes a no-op call fail in the
  handler before `bridge.updateEvent` is reached, with no second `superRefine`
  and no change to the advertised schema.
- **`maxBuffer: 10 * 1024 * 1024`** on the execa options — calendar JSON is tiny;
  10MB is generous headroom while replacing the 100MB default.

## Risks / Trade-offs

- A client that previously relied on a no-op `update_event` succeeding will now
  get a validation error — this is the intended, documented behavior change.
- `maxBuffer` could in theory truncate an enormous event range; 10MB is far above
  any realistic calendar JSON payload, so the trade-off is acceptable.
