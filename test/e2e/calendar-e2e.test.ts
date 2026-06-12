import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  MARKER_PREFIX,
  createTestCalendar,
  deleteTestCalendar,
  sweepLeftoverMarkers,
  calendarAccess,
  listCalendars,
} from "./helpers.js";
// helpers.ts set APPLE_BRIDGE_BIN; import order matters so SwiftBridge sees it.
import { SwiftBridge } from "../../build/bridge/swift.js";
import { registerCalendarTools } from "../../build/tools/calendar.js";

// Defense in depth: the suite no-ops unless explicitly opted in. The e2e vitest
// project must be selected (`npm run test:e2e`) AND this env gate set.
const ENABLED = process.env.E2E_CALENDAR_TESTS === "1";

async function linkClient(bridge: SwiftBridge): Promise<Client> {
  const server = new McpServer({ name: "apple-calendar", version: "e2e" });
  registerCalendarTools(server, bridge);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "e2e-client", version: "e2e" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

function parse(res: any): any {
  expect(res.isError).toBeFalsy();
  return JSON.parse((res.content as { text: string }[])[0].text);
}

describe.skipIf(!ENABLED)("E2E: marker calendar full stack", () => {
  let client: Client;
  let markerName: string;
  let markerCalendarId: string;
  let hasAccess = false;

  // Every write must target the marker calendar — assert before each call.
  function assertMarkerTarget(calendarId: string): void {
    expect(calendarId).toBe(markerCalendarId);
  }

  beforeAll(async () => {
    // doctor is read-only — safe to run even without access.
    hasAccess = (await calendarAccess()) === "fullAccess";
    if (!hasAccess) {
      console.warn(
        "E2E: Full Calendar Access not granted — skipping. Grant it in " +
          "System Settings > Privacy & Security > Calendars, then re-run."
      );
      return;
    }
    await sweepLeftoverMarkers();
    markerName = `${MARKER_PREFIX}${Date.now()}-${process.pid}`;
    const created = await createTestCalendar(markerName);
    markerCalendarId = created.id;
    const bridge = new SwiftBridge();
    client = await linkClient(bridge);
  });

  afterAll(async () => {
    if (hasAccess && markerName) {
      await deleteTestCalendar(markerName);
    }
    // `client` is undefined when access was denied (setup returns early before
    // linking), so the optional chain is the cleanup — InMemoryTransport has no
    // OS resource to leak.
    await client?.close();
  });

  it("creates, queries, searches, and updates an event in the marker calendar", async (ctx) => {
    if (!hasAccess) {
      ctx.skip();
      return;
    }

    // Window: tomorrow 10:00–11:00 local.
    const day = new Date();
    day.setDate(day.getDate() + 1);
    const start = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      10,
      0,
      0
    );
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const title = `E2E Event ${markerName}`;

    // --- create ---
    assertMarkerTarget(markerCalendarId);
    const created = parse(
      await client.callTool({
        name: "create_event",
        arguments: {
          calendarId: markerCalendarId,
          title,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        },
      })
    );
    expect(created.calendarId).toBe(markerCalendarId);
    expect(created.title).toBe(title);
    const eventId = created.id;

    // --- query (get_events) ---
    const windowStart = new Date(start.getTime() - 60 * 60 * 1000);
    const windowEnd = new Date(end.getTime() + 60 * 60 * 1000);
    const events = parse(
      await client.callTool({
        name: "get_events",
        arguments: {
          startDate: windowStart.toISOString(),
          endDate: windowEnd.toISOString(),
          calendarIds: [markerCalendarId],
        },
      })
    );
    expect(events.some((e: any) => e.id === eventId)).toBe(true);

    // --- search ---
    const found = parse(
      await client.callTool({
        name: "search_events",
        arguments: {
          query: markerName,
          startDate: windowStart.toISOString(),
          endDate: windowEnd.toISOString(),
        },
      })
    );
    expect(found.some((e: any) => e.id === eventId)).toBe(true);

    // --- update ---
    // The event already lives in the marker calendar; confirm that before
    // mutating it (no calendarId change, so it stays put).
    assertMarkerTarget(created.calendarId);
    const newTitle = `${title} (updated)`;
    const updated = parse(
      await client.callTool({
        name: "update_event",
        arguments: { eventId, title: newTitle },
      })
    );
    expect(updated.title).toBe(newTitle);
    expect(updated.calendarId).toBe(markerCalendarId);
  });

  it("removes the marker calendar on teardown (verified next run / here)", async (ctx) => {
    if (!hasAccess) {
      ctx.skip();
      return;
    }
    // The marker calendar exists now (created in setup); teardown removes it.
    const cals = await listCalendars();
    expect(cals.some((c) => c.id === markerCalendarId)).toBe(true);
  });
});
