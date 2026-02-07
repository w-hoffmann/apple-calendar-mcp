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
    "delete_event",
    "Delete a calendar event",
    {
      eventId: z.string().describe("Event ID"),
      span: z
        .enum(["this", "all"])
        .describe("Delete this occurrence or all future events"),
      occurrenceDate: z
        .string()
        .optional()
        .describe("Occurrence date for recurring events (ISO8601)"),
    },
    async (args) => {
      try {
        await bridge.deleteEvent({
          eventId: args.eventId,
          span: args.span,
          occurrenceDate: args.occurrenceDate,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify({ deleted: true }, null, 2) },
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
}
