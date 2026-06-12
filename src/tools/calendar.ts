import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { SwiftBridge } from "../bridge/swift.js";
import type { LeanEventInfo } from "../bridge/swift.js";

// --- Shared helpers -------------------------------------------------------

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Run a bridge call and shape the result/error into a tool response.
 *
 * Serialization is compact (`JSON.stringify` with no indentation) for every
 * tool — not just the event tools — so `get_calendars` and `find_free_slots`
 * are leaner too. One source of truth for output shape; the lean event payload
 * is produced upstream in `swift.ts` (`toLeanEvent`).
 */
async function wrap(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  } catch (e) {
    return { content: [{ type: "text", text: errorText(e) }], isError: true };
  }
}

// --- Date semantics (shared description) ----------------------------------

/**
 * The server-local IANA timezone, resolved once at module load. On a local
 * single-user Mac this equals the user's timezone (a documented assumption of
 * this project — not enforced; a remote/hosted deployment would break it).
 * Injected into every date-field description so the model knows which zone
 * "local" means.
 */
export const SERVER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Shared description for every date/datetime input field. The Swift bridge is
 * the authoritative parser and is lenient (see the fix-date-format-timezone
 * change): a naive datetime is interpreted in the server-local timezone, an
 * explicit offset (`Z` or `±HH:MM`) is honored exactly, and a date-only value
 * is read as local midnight. Zod stays `z.string()` so these forms reach Swift.
 */
function dateFieldDescription(label: string): string {
  return (
    `${label}. Accepts local wall-clock time by default ` +
    `(e.g. 2026-06-13T09:00:00, interpreted in the server timezone ${SERVER_TIMEZONE}); ` +
    `an explicit offset (Z or ±HH:MM) is honored exactly; ` +
    `a date-only value (2026-06-13) is read as local midnight.`
  );
}

// --- Input schemas (exported for unit tests) ------------------------------

export const getEventsInput = {
  startDate: z.string().describe(dateFieldDescription("Start date")),
  endDate: z.string().describe(dateFieldDescription("End date")),
  calendars: z.array(z.string()).optional().describe("Filter by calendar names"),
  calendarIds: z.array(z.string()).optional().describe("Filter by calendar IDs"),
};

export const searchEventsInput = {
  query: z
    .string()
    .describe(
      "Search query matched case-insensitively against event title, location, and notes"
    ),
  startDate: z
    .string()
    .optional()
    .describe(dateFieldDescription("Start date (defaults to today)")),
  endDate: z
    .string()
    .optional()
    .describe(dateFieldDescription("End date (defaults to 30 days from now)")),
};

export const recurrenceInput = z
  .object({
    frequency: z
      .enum(["daily", "weekly", "monthly", "yearly"])
      .describe("Repeat frequency"),
    interval: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("Repeat every N units of the frequency (>= 1, default 1)"),
    endDate: z
      .string()
      .optional()
      .describe(
        `${dateFieldDescription(
          "Instant on/before which the series stops recurring (inclusive boundary)"
        )} Mutually exclusive with occurrenceCount.`
      ),
    occurrenceCount: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Total number of occurrences, counting the first/seed event (RFC 5545 COUNT semantics — occurrenceCount: 3 yields the seed plus 2 repeats). Mutually exclusive with endDate"
      ),
    daysOfWeek: z
      .array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]))
      .optional()
      .describe(
        "Weekday codes the series repeats on. Applies to frequency 'weekly' only; rejected for other frequencies"
      ),
  })
  .describe(
    "Optional recurrence rule. Omit for a single non-recurring event. Provide either endDate or occurrenceCount, not both."
  );

export const createEventInput = {
  calendarId: z.string().describe("Calendar ID (from get_calendars)"),
  title: z.string().min(1).describe("Event title"),
  startDate: z.string().describe(dateFieldDescription("Start date")),
  endDate: z.string().describe(dateFieldDescription("End date")),
  timeZone: z.string().optional().describe("Time zone identifier"),
  allDay: z.boolean().optional().describe("All-day event"),
  location: z.string().optional().describe("Event location"),
  notes: z.string().optional().describe("Event notes"),
  recurrence: recurrenceInput.optional(),
};

// Cross-field validation for create_event's recurrence, co-located here (mirrors
// updateEventSchema): `endDate` XOR `occurrenceCount`, and `daysOfWeek` only for
// weekly recurrence. As with update_event, the tool is registered with the raw
// `createEventInput` shape (full discoverability under the pinned SDK, which
// reads `.shape`) and this refine runs in the handler. Swift re-checks the same
// rules authoritatively for the direct-CLI path.
export const createEventSchema = z
  .object(createEventInput)
  .superRefine((val, ctx) => {
    const r = val.recurrence;
    if (!r) return;
    if (r.endDate !== undefined && r.occurrenceCount !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Recurrence may specify either endDate or occurrenceCount, not both.",
        path: ["recurrence"],
      });
    }
    if (r.daysOfWeek !== undefined && r.frequency !== "weekly") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "daysOfWeek applies to weekly recurrence only.",
        path: ["recurrence", "daysOfWeek"],
      });
    }
  });

export const updateEventInput = {
  eventId: z.string().describe("Event ID"),
  span: z
    .enum(["this", "future"])
    .optional()
    .describe(
      "For recurring events: 'this' updates only the given occurrence (default), 'future' updates this and all future occurrences"
    ),
  occurrenceDate: z
    .string()
    .optional()
    .describe(
      "Identifies which occurrence of a recurring series to update: pass the target instance's occurrenceDate value from get_events (its original series slot) — NOT the desired new start time. Required for any recurring target and for span: 'future'. The bridge matches it within a ~1 ms tolerance, so pass the value through verbatim."
    ),
  title: z.string().min(1).optional().describe("New title"),
  startDate: z
    .string()
    .optional()
    .describe(dateFieldDescription("New start date")),
  endDate: z.string().optional().describe(dateFieldDescription("New end date")),
  timeZone: z.string().optional().describe("New time zone identifier"),
  allDay: z.boolean().optional().describe("Mark as all-day or non-all-day"),
  location: z.string().optional().describe("New location"),
  notes: z.string().optional().describe("New notes"),
  calendarId: z
    .string()
    .optional()
    .describe("Move event to the calendar with this ID"),
};

// Cross-field validation for update_event: `span: "future"` requires
// `occurrenceDate`. This refine is enforced in the tool HANDLER (see registration
// below), not via `inputSchema` — the pinned @modelcontextprotocol/sdk 1.26.0
// advertises a tool's input JSON Schema by reading `.shape`, which a ZodEffects
// (.superRefine) does not expose, so passing this schema as `inputSchema` would
// advertise an EMPTY schema (no eventId/occurrenceDate/field docs). The tool is
// therefore registered with the raw `updateEventInput` shape (full discoverability)
// and we run this refine in the handler. `updateEventInput` stays the raw shape
// (other tools / unit tests build `z.object(updateEventInput)`). The
// recurring-without-occurrenceDate (span "this"/default) case is enforced in the
// Swift bridge, which is authoritative and CLI-callable.
export const updateEventSchema = z
  .object(updateEventInput)
  .superRefine((val, ctx) => {
    if (val.span === "future" && val.occurrenceDate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'occurrenceDate is required for span: "future" (set it to the starting occurrence\'s occurrenceDate value from get_events).',
        path: ["occurrenceDate"],
      });
    }
    // Require at least one mutable field: an update with only
    // eventId/span/occurrenceDate would be a no-op write (it mutates
    // last-modified metadata yet changes nothing). Reject it here, before any
    // bridge invocation / save.
    const hasMutableField =
      val.title !== undefined ||
      val.startDate !== undefined ||
      val.endDate !== undefined ||
      val.timeZone !== undefined ||
      val.allDay !== undefined ||
      val.location !== undefined ||
      val.notes !== undefined ||
      val.calendarId !== undefined;
    if (!hasMutableField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "At least one mutable field is required (title, startDate, endDate, timeZone, allDay, location, notes, or calendarId).",
      });
    }
  });

// --- Default search window (exported for unit tests) ----------------------

/**
 * Default window for `search_events` when no dates are given: from the start of
 * the current day in the host's LOCAL time zone through 30 days from now.
 *
 * `new Date(y, m, d)` builds the instant from LOCAL date components, so it is
 * exactly local midnight; `.toISOString()` renders that same instant in UTC
 * (e.g. local 00:00 in CEST -> "...T22:00:00.000Z"). This is correct — do NOT
 * "simplify" to UTC midnight (`setUTCHours(0, 0, 0, 0)` or `new Date("YYYY-MM-DD")`),
 * which lands on local 02:00 in CEST and would miss early-morning events.
 */
export function getDefaultSearchWindow(): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const startDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();
  const endDate = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  return { startDate, endDate };
}

// --- find_free_slots (input schema + pure computation) --------------------

const HHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24-hour)");

export const findFreeSlotsInput = {
  startDate: z.string().describe(dateFieldDescription("Window start")),
  endDate: z.string().describe(dateFieldDescription("Window end")),
  minDurationMinutes: z
    .number()
    .int()
    .positive()
    .default(30)
    .describe("Minimum free-slot length in minutes (default 30)"),
  workingHours: z
    .object({
      start: HHMM.describe("Start of working hours, HH:MM (server-local time)"),
      end: HHMM.describe("End of working hours, HH:MM (server-local time)"),
    })
    .optional()
    .describe(
      "Restrict slots to these hours on each local day. Interpreted in the server's local timezone"
    ),
  calendars: z
    .array(z.string())
    .optional()
    .describe("Only treat events from these calendar names as busy"),
  calendarIds: z
    .array(z.string())
    .optional()
    .describe("Only treat events from these calendar IDs as busy"),
};

/** Minutes since local midnight for an `HH:MM` string (validated by `HHMM`). */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Cross-field validation for find_free_slots: working hours must be a forward
// range (end after start). Without this, an inverted/equal `workingHours`
// (e.g. a typo `{ start: "17:00", end: "09:00" }`) silently clips every day to
// nothing and the tool returns `[]` — indistinguishable from a fully booked
// window. Co-located here and re-checked in the handler, mirroring
// updateEventSchema/createEventSchema (the raw shape stays the advertised
// inputSchema so the SDK exposes all properties).
export const findFreeSlotsSchema = z
  .object(findFreeSlotsInput)
  .superRefine((val, ctx) => {
    const wh = val.workingHours;
    if (wh && hhmmToMinutes(wh.end) <= hhmmToMinutes(wh.start)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "workingHours.end must be later than workingHours.start (overnight ranges are not supported).",
        path: ["workingHours", "end"],
      });
    }
  });

export interface FreeSlot {
  start: string;
  end: string;
}

export interface ComputeFreeSlotsOpts {
  startDate: string;
  endDate: string;
  minDurationMinutes?: number;
  workingHours?: { start: string; end: string };
  calendars?: string[];
  calendarIds?: string[];
}

interface Interval {
  start: number;
  end: number;
}

/**
 * Clip free intervals to `workingHours` (HH:MM, server-local time) on each local
 * day they span. Day boundaries are built from local calendar components
 * (`new Date(y, m, d, hh, mm)`), so DST transition days stay correct — no slot is
 * invented; working-hours edges follow the real local clock.
 */
function clipToWorkingHours(
  free: Interval[],
  wh: { start: string; end: string }
): Interval[] {
  const [wsH, wsM] = wh.start.split(":").map(Number);
  const [weH, weM] = wh.end.split(":").map(Number);
  const out: Interval[] = [];
  for (const slot of free) {
    const first = new Date(slot.start);
    let day = new Date(first.getFullYear(), first.getMonth(), first.getDate());
    while (day.getTime() < slot.end) {
      const y = day.getFullYear();
      const m = day.getMonth();
      const d = day.getDate();
      const whStart = new Date(y, m, d, wsH, wsM, 0, 0).getTime();
      const whEnd = new Date(y, m, d, weH, weM, 0, 0).getTime();
      const s = Math.max(slot.start, whStart);
      const e = Math.min(slot.end, whEnd);
      if (e > s) out.push({ start: s, end: e });
      day = new Date(y, m, d + 1);
    }
  }
  return out;
}

/**
 * Canonicalize the ONE date form on which JS `new Date()` and the Swift bridge
 * diverge: a date-only value (`2026-06-13`). JS `new Date("2026-06-13")` reads it
 * as UTC midnight; the bridge resolves date-only to LOCAL midnight. Appending
 * `T00:00:00` makes `new Date()` read it as a naive (local) midnight, matching
 * the bridge. Every other form passes through unchanged — this deliberately does
 * NOT re-encode the offset/naive rules (the bridge stays the single parse
 * authority; offset→exact and naive-datetime→local already agree between the two
 * parsers). Used by `find_free_slots`, the one tool that parses its window both
 * client-side (`computeFreeSlots`) and via the bridge.
 */
export function canonicalizeDateArg(s: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + "T00:00:00" : s;
}

/**
 * Format an epoch-ms instant with the server-local UTC offset (e.g.
 * `2026-06-13T10:00:00.000+02:00`), mirroring Swift's `formatISO8601`: when the
 * local offset is zero it renders `Z` (so a UTC host and the Swift bridge agree),
 * otherwise `±HH:MM`. The emitted instant is unchanged by the representation.
 *
 * `offsetMin` (minutes EAST of UTC; Berlin summer = +120) defaults to the host's
 * offset for this instant — a testability seam mirroring Swift's injectable
 * `zone`, so unit tests can pin a specific offset under any CI timezone.
 */
export function formatLocalISO(
  ms: number,
  offsetMin: number = -new Date(ms).getTimezoneOffset()
): string {
  // Exact-UTC instant → `...Z`, identical to Swift's UTC-zone output.
  if (offsetMin === 0) return new Date(ms).toISOString();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  // Shift the instant by the offset so the UTC getters read local wall-clock
  // components — independent of the host's own timezone.
  const local = new Date(ms + offsetMin * 60_000);
  const body =
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}` +
    `.${pad(local.getUTCMilliseconds(), 3)}`;
  const sign = offsetMin > 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return `${body}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * Pure free-slot computation over already-fetched events. Timed events are busy;
 * all-day events never block. Busy intervals are clipped to the window (boundary-
 * straddling events block only their in-window portion), zero-length events are
 * dropped, overlapping AND touching/back-to-back intervals are merged, the result
 * is inverted within the window, optionally clipped to working hours per local
 * day, and slots shorter than the minimum are dropped. A fully booked window
 * yields `[]`.
 */
export function computeFreeSlots(
  events: LeanEventInfo[],
  opts: ComputeFreeSlotsOpts
): FreeSlot[] {
  const windowStart = new Date(opts.startDate).getTime();
  const windowEnd = new Date(opts.endDate).getTime();
  if (!(windowEnd > windowStart)) return [];
  const minMs = (opts.minDurationMinutes ?? 30) * 60_000;

  const nameSet = opts.calendars?.length
    ? new Set(opts.calendars.map((c) => c.toLowerCase()))
    : null;
  const idSet = opts.calendarIds?.length ? new Set(opts.calendarIds) : null;
  const filterActive = nameSet !== null || idSet !== null;

  const busy: Interval[] = [];
  for (const e of events) {
    if (e.isAllDay) continue; // all-day events don't occupy timed availability
    if (filterActive) {
      const matches =
        (nameSet?.has(e.calendarTitle.toLowerCase()) ?? false) ||
        (idSet?.has(e.calendarId) ?? false);
      if (!matches) continue;
    }
    const s = Math.max(new Date(e.startDate).getTime(), windowStart);
    const en = Math.min(new Date(e.endDate).getTime(), windowEnd);
    // Skip unparseable dates (NaN) too: `NaN <= s` is false, so the bare
    // `en <= s` guard would let a NaN interval through and later crash on
    // `new Date(NaN).toISOString()`. Defensive — the Swift bridge always emits
    // valid ISO8601, but computeFreeSlots is exported and unit-tested directly.
    if (!Number.isFinite(s) || !Number.isFinite(en) || en <= s) continue;
    busy.push({ start: s, end: en });
  }

  busy.sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const iv of busy) {
    const last = merged[merged.length - 1];
    // `<=` merges touching/back-to-back intervals, not just overlapping ones.
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }

  const free: Interval[] = [];
  let cursor = windowStart;
  for (const b of merged) {
    if (b.start > cursor) free.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < windowEnd) free.push({ start: cursor, end: windowEnd });

  const constrained = opts.workingHours
    ? clipToWorkingHours(free, opts.workingHours)
    : free;

  return constrained
    .filter((s) => s.end - s.start >= minMs)
    .map((s) => ({
      start: formatLocalISO(s.start),
      end: formatLocalISO(s.end),
    }));
}

// --- Tool registration ----------------------------------------------------

export function registerCalendarTools(
  server: McpServer,
  bridge: SwiftBridge
): void {
  server.registerTool(
    "get_calendars",
    {
      title: "List calendars",
      description: "List all calendars",
      annotations: { readOnlyHint: true },
    },
    async () => wrap(() => bridge.calendars())
  );

  server.registerTool(
    "get_events",
    {
      title: "Get events",
      description:
        `Get events in a date range. Recurring events are expanded into individual occurrences (each carries its own occurrenceDate). startDate/endDate accept local wall-clock time by default (interpreted in the server timezone ${SERVER_TIMEZONE}), an explicit offset (Z or ±HH:MM) is honored exactly, and a date-only value (e.g. 2026-06-13) is allowed (local midnight). Returned timestamps carry the local UTC offset (e.g. 2026-06-13T10:00:00+02:00); an event's own time zone is reported in timeZone when set. Optional calendars (names) and calendarIds combine as a union — an event is returned if it matches either filter.`,
      inputSchema: getEventsInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      wrap(() =>
        bridge.events({
          startDate: args.startDate,
          endDate: args.endDate,
          calendars: args.calendars,
          calendarIds: args.calendarIds,
        })
      )
  );

  server.registerTool(
    "search_events",
    {
      title: "Search events",
      description:
        "Search events by title, location, or notes (client-side substring filtering)",
      inputSchema: searchEventsInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      wrap(async () => {
        const def = getDefaultSearchWindow();
        const startDate = args.startDate ?? def.startDate;
        const endDate = args.endDate ?? def.endDate;

        const events = await bridge.events({ startDate, endDate });
        const query = args.query.toLowerCase();
        return events.filter(
          (e) =>
            e.title.toLowerCase().includes(query) ||
            e.location?.toLowerCase().includes(query) ||
            e.notes?.toLowerCase().includes(query)
        );
      })
  );

  server.registerTool(
    "find_free_slots",
    {
      title: "Find free time",
      description:
        `Find free time gaps within a startDate/endDate window. startDate/endDate accept local wall-clock time by default (server timezone ${SERVER_TIMEZONE}), an explicit offset (Z or ±HH:MM) is honored, and a date-only value (e.g. 2026-06-13) is read as local midnight. Timed events count as busy; all-day events do not block. minDurationMinutes (default 30) omits shorter gaps. Optional workingHours ({ start, end } as HH:MM) and a calendar filter (calendars names and/or calendarIds — an event is busy if it matches either) constrain busy time; working hours and day boundaries use the server's local timezone. Returns an array of { start, end } whose timestamps carry the local UTC offset (an exact-UTC instant may render as Z); an empty array means no free slot (e.g. a fully booked window).`,
      inputSchema: findFreeSlotsInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      wrap(() => {
        // Enforce findFreeSlotsSchema's refine (workingHours end > start) here,
        // since the advertised inputSchema is the un-refined raw shape.
        const parsed = findFreeSlotsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(
            parsed.error.issues[0]?.message ?? "Invalid find_free_slots arguments"
          );
        }
        // Canonicalize a date-only window to local midnight ONCE, then feed the
        // SAME strings to both the bridge fetch and the client-side inversion, so
        // the events fetched and the window computeFreeSlots inverts share an
        // identical boundary (a date-only value would otherwise be UTC midnight on
        // the JS side but local midnight at the bridge — a silent day shift).
        const startDate = canonicalizeDateArg(args.startDate);
        const endDate = canonicalizeDateArg(args.endDate);
        // Fetch the FULL window (no calendar filter at the bridge) and let
        // computeFreeSlots own the names-OR-ids union. Filtering lives in exactly
        // one place — the pure, unit-tested computeFreeSlots — rather than being
        // split across the TS and Swift layers.
        return bridge
          .events({ startDate, endDate })
          .then((events) =>
            computeFreeSlots(events, {
              startDate,
              endDate,
              minDurationMinutes: args.minDurationMinutes,
              workingHours: args.workingHours,
              calendars: args.calendars,
              calendarIds: args.calendarIds,
            })
          );
      })
  );

  server.registerTool(
    "create_event",
    {
      title: "Create event",
      description:
        `Create a new calendar event. calendarId comes from get_calendars. startDate/endDate accept local wall-clock time by default (server timezone ${SERVER_TIMEZONE}), an explicit offset (Z or ±HH:MM) is honored, and a date-only value is read as local midnight; returned timestamps carry the local UTC offset. Pass an optional recurrence object (frequency daily/weekly/monthly/yearly, interval, and either endDate or occurrenceCount; daysOfWeek applies to weekly only) to create a repeating event in one call.`,
      // Raw shape (not createEventSchema) so the SDK advertises all properties +
      // descriptions; the recurrence cross-field refine runs in the handler below.
      inputSchema: createEventInput,
      // Additive write: advertise destructiveHint FALSE explicitly. Per MCP spec
      // 2025-11-25, destructiveHint defaults to true when readOnlyHint is false,
      // so omitting it would make a spec-compliant client treat create as
      // destructive — the opposite of intent. update_event keeps true.
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) =>
      wrap(() => {
        // Enforce createEventSchema's refine (endDate XOR occurrenceCount;
        // daysOfWeek weekly-only) here, since the advertised inputSchema is the
        // un-refined raw shape. Single source of truth for the rule.
        const parsed = createEventSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(
            parsed.error.issues[0]?.message ?? "Invalid create_event arguments"
          );
        }
        return bridge.createEvent({
          calendarId: args.calendarId,
          title: args.title,
          startDate: args.startDate,
          endDate: args.endDate,
          timeZone: args.timeZone,
          allDay: args.allDay,
          location: args.location,
          notes: args.notes,
          recurrence: args.recurrence,
        });
      })
  );

  server.registerTool(
    "update_event",
    {
      title: "Update event",
      description:
        `Update an existing event. Use this to reschedule (change startDate/endDate), rename (change title), move between calendars (change calendarId), or edit location/notes. startDate/endDate accept local wall-clock time by default (server timezone ${SERVER_TIMEZONE}), an explicit offset (Z or ±HH:MM) is honored, and a date-only value is read as local midnight; returned timestamps carry the local UTC offset. Only fields you pass are changed; omitted fields are left untouched. The event ID stays the same and existing invitations are preserved. For a recurring event you MUST pass occurrenceDate (the target instance's occurrenceDate value from get_events) to select which occurrence to change; updating a recurring event without it is rejected. span: 'future' also requires occurrenceDate. Rejects empty titles, an inverted date range (start after end), an invalid time zone, and an unknown span.`,
      // Raw shape (not updateEventSchema) so the SDK advertises all properties +
      // descriptions; the cross-field refine runs in the handler below.
      inputSchema: updateEventInput,
      // Overwrites existing event state, so it is non-read-only AND destructive.
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) =>
      wrap(() => {
        // Enforce updateEventSchema's refine (span: "future" ⇒ occurrenceDate) here,
        // since the advertised inputSchema is the un-refined raw shape. Single source
        // of truth for the rule, so sibling-change refinements merged into
        // updateEventSchema apply automatically.
        const parsed = updateEventSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(
            parsed.error.issues[0]?.message ?? "Invalid update_event arguments"
          );
        }
        return bridge.updateEvent({
          eventId: args.eventId,
          span: args.span,
          occurrenceDate: args.occurrenceDate,
          title: args.title,
          startDate: args.startDate,
          endDate: args.endDate,
          timeZone: args.timeZone,
          allDay: args.allDay,
          location: args.location,
          notes: args.notes,
          calendarId: args.calendarId,
        });
      })
  );
}
