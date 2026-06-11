import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { SwiftBridge } from "../bridge/swift.js";

// --- Shared helpers -------------------------------------------------------

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Run a bridge call and shape the result/error into a tool response. */
async function wrap(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: errorText(e) }], isError: true };
  }
}

// --- Input schemas (exported for unit tests) ------------------------------

export const getEventsInput = {
  startDate: z.string().describe("Start date (ISO8601)"),
  endDate: z.string().describe("End date (ISO8601)"),
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
    .describe("Start date (ISO8601, defaults to today)"),
  endDate: z
    .string()
    .optional()
    .describe("End date (ISO8601, defaults to 30 days from now)"),
};

export const createEventInput = {
  calendarId: z.string().describe("Calendar ID"),
  title: z.string().min(1).describe("Event title"),
  startDate: z.string().describe("Start date (ISO8601)"),
  endDate: z.string().describe("End date (ISO8601)"),
  timeZone: z.string().optional().describe("Time zone identifier"),
  allDay: z.boolean().optional().describe("All-day event"),
  location: z.string().optional().describe("Event location"),
  notes: z.string().optional().describe("Event notes"),
};

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
  startDate: z.string().optional().describe("New start date (ISO8601)"),
  endDate: z.string().optional().describe("New end date (ISO8601)"),
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

// --- Tool registration ----------------------------------------------------

export function registerCalendarTools(
  server: McpServer,
  bridge: SwiftBridge
): void {
  server.registerTool(
    "get_calendars",
    { title: "List calendars", description: "List all calendars" },
    async () => wrap(() => bridge.calendars())
  );

  server.registerTool(
    "get_events",
    {
      title: "Get events",
      description: "Get events in a date range (expands recurring events)",
      inputSchema: getEventsInput,
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
    "get_today_events",
    { title: "Today's events", description: "Get all events for today" },
    async () => wrap(() => bridge.today())
  );

  server.registerTool(
    "search_events",
    {
      title: "Search events",
      description:
        "Search events by title, location, or notes (client-side substring filtering)",
      inputSchema: searchEventsInput,
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
    "create_event",
    {
      title: "Create event",
      description: "Create a new calendar event",
      inputSchema: createEventInput,
    },
    async (args) =>
      wrap(() =>
        bridge.createEvent({
          calendarId: args.calendarId,
          title: args.title,
          startDate: args.startDate,
          endDate: args.endDate,
          timeZone: args.timeZone,
          allDay: args.allDay,
          location: args.location,
          notes: args.notes,
        })
      )
  );

  server.registerTool(
    "update_event",
    {
      title: "Update event",
      description:
        "Update an existing event. Use this to reschedule (change startDate/endDate), rename (change title), move between calendars (change calendarId), or edit location/notes. Only fields you pass are changed; omitted fields are left untouched. The event ID stays the same and existing invitations are preserved. For a recurring event you MUST pass occurrenceDate (the target instance's occurrenceDate value from get_events) to select which occurrence to change; updating a recurring event without it is rejected. span: 'future' also requires occurrenceDate. Rejects empty titles, an inverted date range (start after end), an invalid time zone, and an unknown span.",
      // Raw shape (not updateEventSchema) so the SDK advertises all properties +
      // descriptions; the cross-field refine runs in the handler below.
      inputSchema: updateEventInput,
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
