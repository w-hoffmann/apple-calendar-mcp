import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  createEventInput,
  updateEventInput,
  updateEventSchema,
  registerCalendarTools,
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
      }).success
    ).toBe(true);
  });

  it('accepts span: "this" without occurrenceDate', () => {
    expect(
      updateEventSchema.safeParse({ eventId: "E", span: "this" }).success
    ).toBe(true);
  });

  it("accepts an omitted span without occurrenceDate", () => {
    expect(updateEventSchema.safeParse({ eventId: "E" }).success).toBe(true);
  });
});

// Regression: update_event must advertise its full input schema AND still enforce
// the span/occurrenceDate refine in the handler. Registering the ZodEffects
// (.superRefine) schema as inputSchema would advertise an EMPTY schema under the
// pinned MCP SDK (it reads `.shape`, which a ZodEffects lacks) — so the tool is
// registered with the raw shape and the refine runs in the handler.
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
    const r = await tools.update_event.handler({ eventId: "E", span: "this" });
    expect(r.isError).toBeFalsy();
    expect(getLastBridgeCall()?.eventId).toBe("E");
  });
});
