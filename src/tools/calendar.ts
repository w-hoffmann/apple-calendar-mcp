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
  query: z.string().describe("Search query to match event titles"),
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
      "Occurrence date for recurring events (ISO8601). Required if you want to target a specific instance of a recurring series"
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
      description: "Search events by title (client-side filtering)",
      inputSchema: searchEventsInput,
    },
    async (args) =>
      wrap(async () => {
        const now = new Date();
        const startDate =
          args.startDate ??
          new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          ).toISOString();
        const endDate =
          args.endDate ??
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

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
        "Update an existing event. Use this to reschedule (change startDate/endDate), rename (change title), move between calendars (change calendarId), or edit location/notes. Only fields you pass are changed; omitted fields are left untouched. The event ID stays the same and existing invitations are preserved. Rejects empty titles, an inverted date range (start after end), an invalid time zone, and an unknown span.",
      inputSchema: updateEventInput,
    },
    async (args) =>
      wrap(() =>
        bridge.updateEvent({
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
        })
      )
  );
}
