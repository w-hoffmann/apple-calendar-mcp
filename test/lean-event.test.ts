import { describe, it, expect } from "vitest";
// Tests run against the compiled output in build/ (see the "test" script).
import { toLeanEvent } from "../build/bridge/swift.js";

// A full bridge EventInfo (the shape Swift emits, before leaning).
function fullEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "EVT-1",
    externalId: "EXT-1",
    calendarId: "CAL-1",
    calendarTitle: "Home",
    title: "Standup",
    startDate: "2026-07-01T10:00:00.000Z",
    endDate: "2026-07-01T11:00:00.000Z",
    timeZone: null,
    isAllDay: false,
    hasRecurrenceRules: false,
    occurrenceDate: null,
    isDetached: false,
    location: null,
    notes: null,
    ...overrides,
  } as any;
}

describe("toLeanEvent", () => {
  it("drops dead-weight fields isDetached and externalId", () => {
    const lean = toLeanEvent(fullEvent());
    expect("externalId" in lean).toBe(false);
    expect("isDetached" in lean).toBe(false);
  });

  it("omits null optional fields entirely", () => {
    const lean = toLeanEvent(fullEvent());
    expect("timeZone" in lean).toBe(false);
    expect("location" in lean).toBe(false);
    expect("notes" in lean).toBe(false);
    expect("occurrenceDate" in lean).toBe(false);
  });

  it("keeps identity and operational fields always present", () => {
    const lean = toLeanEvent(fullEvent());
    expect(lean.id).toBe("EVT-1");
    expect(lean.calendarId).toBe("CAL-1");
    expect(lean.calendarTitle).toBe("Home");
    expect(lean.title).toBe("Standup");
    expect(lean.startDate).toBe("2026-07-01T10:00:00.000Z");
    expect(lean.endDate).toBe("2026-07-01T11:00:00.000Z");
    expect(lean.isAllDay).toBe(false);
    expect(lean.hasRecurrenceRules).toBe(false);
  });

  it("keeps endDate present for an all-day event (EventKit exclusive end)", () => {
    const lean = toLeanEvent(
      fullEvent({
        isAllDay: true,
        startDate: "2026-02-01T00:00:00.000Z",
        endDate: "2026-02-02T00:00:00.000Z",
      })
    );
    expect(lean.isAllDay).toBe(true);
    expect(lean.endDate).toBe("2026-02-02T00:00:00.000Z");
  });

  it("includes the optional fields when they have a value", () => {
    const lean = toLeanEvent(
      fullEvent({
        timeZone: "America/New_York",
        location: "Room 1",
        notes: "bring laptop",
        hasRecurrenceRules: true,
        occurrenceDate: "2026-07-01T10:00:00.000Z",
      })
    );
    expect(lean.timeZone).toBe("America/New_York");
    expect(lean.location).toBe("Room 1");
    expect(lean.notes).toBe("bring laptop");
    expect(lean.occurrenceDate).toBe("2026-07-01T10:00:00.000Z");
  });

  it("includes occurrenceDate only when present", () => {
    expect("occurrenceDate" in toLeanEvent(fullEvent())).toBe(false);
    const recurring = toLeanEvent(
      fullEvent({
        hasRecurrenceRules: true,
        occurrenceDate: "2026-07-08T10:00:00.000Z",
      })
    );
    expect(recurring.occurrenceDate).toBe("2026-07-08T10:00:00.000Z");
  });

  it("serializes compactly (no pretty-print whitespace)", () => {
    const json = JSON.stringify(toLeanEvent(fullEvent()));
    expect(json).not.toMatch(/\n/);
    expect(json).not.toMatch(/": /); // no "key": value spacing from indentation
    // No omitted field may appear as an explicit null. Match `:null` precisely
    // (followed by , or }) rather than the substring "null", so a future fixture
    // value like "null island" wouldn't false-fail.
    expect(json).not.toMatch(/:null([,}])/);
  });
});
