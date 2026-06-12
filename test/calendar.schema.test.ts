import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  createEventInput,
  updateEventInput,
  updateEventSchema,
  registerCalendarTools,
  getDefaultSearchWindow,
} from "../build/tools/calendar.js";

const createSchema = z.object(createEventInput);
const updateSchema = z.object(updateEventInput);

describe("create_event input schema", () => {
  it("rejects an empty title", () => {
    const r = createSchema.safeParse({
      calendarId: "C",
      title: "",
      startDate: "2026-07-01T10:00:00Z",
      endDate: "2026-07-01T11:00:00Z",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a valid event", () => {
    const r = createSchema.safeParse({
      calendarId: "C",
      title: "Standup",
      startDate: "2026-07-01T10:00:00Z",
      endDate: "2026-07-01T11:00:00Z",
    });
    expect(r.success).toBe(true);
  });

  it("requires calendarId/title/startDate/endDate", () => {
    expect(createSchema.safeParse({ title: "x" }).success).toBe(false);
  });
});

describe("update_event input schema", () => {
  it("allows an absent title (partial update)", () => {
    const r = updateSchema.safeParse({
      eventId: "E",
      startDate: "2026-07-01T10:00:00Z",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty title when provided", () => {
    expect(updateSchema.safeParse({ eventId: "E", title: "" }).success).toBe(
      false
    );
  });

  it("rejects an unknown span", () => {
    expect(
      updateSchema.safeParse({ eventId: "E", span: "sideways" }).success
    ).toBe(false);
  });

  it("accepts span this/future", () => {
    expect(updateSchema.safeParse({ eventId: "E", span: "this" }).success).toBe(
      true
    );
    expect(
      updateSchema.safeParse({ eventId: "E", span: "future" }).success
    ).toBe(true);
  });
});

describe("update_event refined schema (span/occurrenceDate)", () => {
  it('rejects span: "future" without occurrenceDate', () => {
    expect(
      updateEventSchema.safeParse({ eventId: "E", span: "future" }).success
    ).toBe(false);
  });

  it('accepts span: "future" with occurrenceDate', () => {
    expect(
      updateEventSchema.safeParse({
        eventId: "E",
        span: "future",
        occurrenceDate: "2026-07-01T10:00:00Z",
        title: "New title",
      }).success
    ).toBe(true);
  });

  it('accepts span: "this" without occurrenceDate', () => {
    expect(
      updateEventSchema.safeParse({
        eventId: "E",
        span: "this",
        title: "New title",
      }).success
    ).toBe(true);
  });

  it("accepts an omitted span without occurrenceDate", () => {
    expect(
      updateEventSchema.safeParse({
        eventId: "E",
        title: "New title",
      }).success
    ).toBe(true);
  });

  it("rejects a no-op update with no mutable field", () => {
    // Only eventId — no title/startDate/endDate/timeZone/allDay/location/notes/
    // calendarId — would be a no-op write, so it must fail validation.
    expect(updateEventSchema.safeParse({ eventId: "E" }).success).toBe(false);
    expect(
      updateEventSchema.safeParse({
        eventId: "E",
        span: "this",
        occurrenceDate: "2026-07-01T10:00:00Z",
      }).success
    ).toBe(false);
  });

  it("accepts an update that supplies at least one mutable field", () => {
    expect(
      updateEventSchema.safeParse({ eventId: "E", location: "Room 1" }).success
    ).toBe(true);
    expect(
      updateEventSchema.safeParse({ eventId: "E", allDay: true }).success
    ).toBe(true);
  });
});

// Regression: update_event must advertise its full input schema AND still enforce
// the span/occurrenceDate refine in the handler. Registering the ZodEffects
// (.superRefine) schema as inputSchema would advertise an EMPTY schema under the
// pinned MCP SDK (it reads `.shape`, which a ZodEffects lacks) — so the tool is
// registered with the raw shape and the refine runs in the handler.
// Regression: the default search window must start at LOCAL midnight of the
// current day (not UTC midnight, not "now"). `getDefaultSearchWindow` is the
// single source of truth for this; these assertions are time-zone-agnostic
// because `Date#getHours/getMinutes/getSeconds` read back in the host's local
// zone — local midnight reads as 00:00:00 regardless of the host's UTC offset.
describe("getDefaultSearchWindow", () => {
  it("starts at local midnight of the current day", () => {
    const { startDate } = getDefaultSearchWindow();
    const start = new Date(startDate);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(start.getDate()).toBe(new Date().getDate());
  });

  it("ends ~30 days from now", () => {
    const { startDate, endDate } = getDefaultSearchWindow();
    const spanDays =
      (new Date(endDate).getTime() - new Date(startDate).getTime()) /
      (24 * 60 * 60 * 1000);
    // start is today's local midnight, end is now+30d, so the span is in
    // [30, 31) days; assert a tolerant band rather than an exact value.
    expect(spanDays).toBeGreaterThanOrEqual(30);
    expect(spanDays).toBeLessThan(31);
  });
});

describe("update_event tool registration", () => {
  function register() {
    const tools = {};
    let lastBridgeCall = null;
    const fakeBridge = {
      updateEvent: async (o) => {
        lastBridgeCall = o;
        return { id: o.eventId };
      },
    };
    const fakeServer = {
      registerTool: (name, config, handler) => {
        tools[name] = { config, handler };
      },
    };
    registerCalendarTools(fakeServer, fakeBridge);
    return { tools, getLastBridgeCall: () => lastBridgeCall };
  }

  it("advertises all 11 update_event input properties (not an empty schema)", () => {
    const { tools } = register();
    const shape = tools.update_event.config.inputSchema;
    const keys = Object.keys(shape);
    expect(keys).toContain("eventId");
    expect(keys).toContain("occurrenceDate");
    expect(keys.length).toBe(11);
  });

  it('handler rejects span:"future" without occurrenceDate and does not call the bridge', async () => {
    const { tools, getLastBridgeCall } = register();
    const r = await tools.update_event.handler({ eventId: "E", span: "future" });
    expect(r.isError).toBe(true);
    expect(getLastBridgeCall()).toBeNull();
  });

  it("handler passes a valid update through to the bridge", async () => {
    const { tools, getLastBridgeCall } = register();
    const r = await tools.update_event.handler({
      eventId: "E",
      span: "this",
      title: "New title",
    });
    expect(r.isError).toBeFalsy();
    expect(getLastBridgeCall()?.eventId).toBe("E");
  });

  it("handler rejects a no-op update and does not call the bridge", async () => {
    const { tools, getLastBridgeCall } = register();
    const r = await tools.update_event.handler({ eventId: "E" });
    expect(r.isError).toBe(true);
    expect(getLastBridgeCall()).toBeNull();
  });
});

// Regression: the search_events tool and its `query` parameter must advertise
// that matching covers title, location, AND notes (not title alone), so the
// client can discover that a location/notes substring is searchable.
describe("search_events advertises all matched fields", () => {
  function registerTools() {
    const tools = {};
    const fakeServer = {
      registerTool: (name, config, handler) => {
        tools[name] = { config, handler };
      },
    };
    registerCalendarTools(fakeServer, {});
    return tools;
  }

  it("tool description names title, location, and notes", () => {
    const desc = registerTools().search_events.config.description.toLowerCase();
    expect(desc).toContain("title");
    expect(desc).toContain("location");
    expect(desc).toContain("notes");
  });

  it("query parameter description names title, location, and notes", () => {
    const shape = registerTools().search_events.config.inputSchema;
    const queryDesc = shape.query.description?.toLowerCase() ?? "";
    expect(queryDesc).toContain("title");
    expect(queryDesc).toContain("location");
    expect(queryDesc).toContain("notes");
  });
});
