import { describe, it, expect } from "vitest";
import {
  buildCreateArgs,
  buildUpdateArgs,
  buildEventsArgs,
} from "../build/bridge/swift.js";

describe("buildUpdateArgs", () => {
  it("emits --no-all-day only when allDay === false", () => {
    const a = buildUpdateArgs({ eventId: "E", allDay: false });
    expect(a).toContain("--no-all-day");
    expect(a).not.toContain("--all-day");
  });

  it("emits --all-day when allDay === true", () => {
    const a = buildUpdateArgs({ eventId: "E", allDay: true });
    expect(a).toContain("--all-day");
    expect(a).not.toContain("--no-all-day");
  });

  it("emits neither all-day flag when allDay is undefined", () => {
    const a = buildUpdateArgs({ eventId: "E" });
    expect(a).not.toContain("--all-day");
    expect(a).not.toContain("--no-all-day");
  });

  it("passes an empty --title through (the bridge rejects it)", () => {
    const a = buildUpdateArgs({ eventId: "E", title: "" });
    const i = a.indexOf("--title");
    expect(i).toBeGreaterThan(-1);
    expect(a[i + 1]).toBe("");
  });

  it("includes span/occurrence/calendar-id when set", () => {
    const a = buildUpdateArgs({
      eventId: "E",
      span: "future",
      occurrenceDate: "2026-07-01T00:00:00Z",
      calendarId: "C2",
    });
    expect(a).toEqual(
      expect.arrayContaining([
        "--span",
        "future",
        "--occurrence",
        "2026-07-01T00:00:00Z",
        "--calendar-id",
        "C2",
      ])
    );
  });
});

describe("buildCreateArgs", () => {
  it("includes required fields and --all-day when true", () => {
    const a = buildCreateArgs({
      calendarId: "C",
      title: "T",
      startDate: "s",
      endDate: "e",
      allDay: true,
    });
    expect(a.slice(0, 9)).toEqual([
      "create-event",
      "--calendar-id",
      "C",
      "--title",
      "T",
      "--start",
      "s",
      "--end",
      "e",
    ]);
    expect(a).toContain("--all-day");
  });

  it("omits --all-day when falsy", () => {
    expect(
      buildCreateArgs({ calendarId: "C", title: "T", startDate: "s", endDate: "e" })
    ).not.toContain("--all-day");
  });
});

describe("buildEventsArgs", () => {
  it("adds calendar name filters when present", () => {
    expect(
      buildEventsArgs({ startDate: "s", endDate: "e", calendars: ["Work"] })
    ).toEqual(["events", "--start", "s", "--end", "e", "--calendars", "Work"]);
  });
});
