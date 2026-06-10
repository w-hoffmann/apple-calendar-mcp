import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SwiftBridge } from "../bridge/swift.js";

export function registerCalendarTools(
  server: McpServer,
  bridge: SwiftBridge
): void {
  server.tool("get_calendars", "List all calendars", {}, async () => {
    try {
      const calendars = await bridge.calendars();
      return {
        content: [{ type: "text", text: JSON.stringify(calendars, null, 2) }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: String(e) }],
        isError: true,
      };
    }
  });

  server.tool(
    "get_events",
    "Get events in a date range (expands recurring events)",
    {
      startDate: z.string().describe("Start date (ISO8601)"),
      endDate: z.string().describe("End date (ISO8601)"),
      calendars: z
        .array(z.string())
        .optional()
        .describe("Filter by calendar names"),
      calendarIds: z
        .array(z.string())
        .optional()
        .describe("Filter by calendar IDs"),
    },
    async (args) => {
      try {
        const events = await bridge.events({
          startDate: args.startDate,
          endDate: args.endDate,
          calendars: args.calendars,
          calendarIds: args.calendarIds,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(events, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: String(e) }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_today_events",
    "Get all events for today",
    {},
    async () => {
      try {
        const events = await bridge.today();
        return {
          content: [{ type: "text", text: JSON.stringify(events, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: String(e) }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "search_events",
    "Search events by title (client-side filtering)",
    {
      query: z.string().describe("Search query to match event titles"),
      startDate: z
        .string()
        .optional()
        .describe("Start date (ISO8601, defaults to today)"),
      endDate: z
        .string()
        .optional()
        .describe("End date (ISO8601, defaults to 30 days from now)"),
    },
    async (args) => {
      try {
        const now = new Date();
        const startDate =
          args.startDate ?? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const endDate =
          args.endDate ??
          new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ).toISOString();

        const events = await bridge.events({ startDate, endDate });
        const query = args.query.toLowerCase();
        const filtered = events.filter(
          (e) =>
            e.title.toLowerCase().includes(query) ||
            e.location?.toLowerCase().includes(query) ||
            e.notes?.toLowerCase().includes(query)
        );
        return {
          content: [
            { type: "text", text: JSON.stringify(filtered, null, 2) },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: String(e) }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "create_event",
    "Create a new calendar event",
    {
      calendarId: z.string().describe("Calendar ID"),
      title: z.string().describe("Event title"),
      startDate: z.string().describe("Start date (ISO8601)"),
      endDate: z.string().describe("End date (ISO8601)"),
      timeZone: z.string().optional().describe("Time zone identifier"),
      allDay: z.boolean().optional().describe("All-day event"),
      location: z.string().optional().describe("Event location"),
      notes: z.string().optional().describe("Event notes"),
    },
    async (args) => {
      try {
        const event = await bridge.createEvent({
          calendarId: args.calendarId,
          title: args.title,
          startDate: args.startDate,
          endDate: args.endDate,
          timeZone: args.timeZone,
          allDay: args.allDay,
          location: args.location,
          notes: args.notes,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(event, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: String(e) }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "update_event",
    "Update an existing event. Use this to reschedule (change startDate/endDate), rename (change title), move between calendars (change calendarId), or edit location/notes. Only fields you pass are changed; omitted fields are left untouched. The event ID stays the same and existing invitations are preserved.",
    {
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
      title: z.string().optional().describe("New title"),
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
    },
    async (args) => {
      try {
        const event = await bridge.updateEvent({
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
        return {
          content: [{ type: "text", text: JSON.stringify(event, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: String(e) }],
          isError: true,
        };
      }
    }
  );
}
