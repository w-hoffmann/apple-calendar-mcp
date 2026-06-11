import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createEventInput, updateEventInput } from "../build/tools/calendar.js";

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
