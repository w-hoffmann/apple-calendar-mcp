import { describe, it, expect } from "vitest";
import { z } from "zod";
// Tests run against the compiled output in build/ (see the "test" script).
import {
  findFreeSlotsInput,
  findFreeSlotsSchema,
  computeFreeSlots,
  canonicalizeDateArg,
  formatLocalISO,
} from "../build/tools/calendar.js";

const findSchema = z.object(findFreeSlotsInput);

// computeFreeSlots now emits slot timestamps with the SERVER-LOCAL offset
// (mirroring the Swift bridge), not a UTC `Z`. The exact string is therefore
// timezone-dependent and the suite pins TZ=America/New_York, so assert on the
// parsed INSTANT (timezone-independent, CI-stable) rather than the literal
// string. The local-offset *format* is asserted separately in the
// "formatLocalISO" describe block below.
const instant = (s: string) => new Date(s).getTime();
const instants = (slots: { start: string; end: string }[]) =>
  slots.map((s) => ({ start: instant(s.start), end: instant(s.end) }));

// Minimal LeanEventInfo-shaped event factory. Defaults to a timed event in
// calendar "Home"; tests override startDate/endDate/isAllDay/calendar as needed.
function ev(
  startDate: string,
  endDate: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "E",
    calendarId: "CAL-HOME",
    calendarTitle: "Home",
    title: "Busy",
    startDate,
    endDate,
    isAllDay: false,
    hasRecurrenceRules: false,
    ...overrides,
  } as any;
}

const WINDOW = {
  startDate: "2026-07-01T09:00:00Z",
  endDate: "2026-07-01T17:00:00Z",
};

describe("findFreeSlotsInput schema", () => {
  it("defaults minDurationMinutes to 30", () => {
    const r = findSchema.safeParse(WINDOW);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.minDurationMinutes).toBe(30);
  });

  it("requires startDate and endDate", () => {
    expect(findSchema.safeParse({ startDate: "x" }).success).toBe(false);
    expect(findSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a non-positive minDurationMinutes", () => {
    expect(
      findSchema.safeParse({ ...WINDOW, minDurationMinutes: 0 }).success
    ).toBe(false);
    expect(
      findSchema.safeParse({ ...WINDOW, minDurationMinutes: -15 }).success
    ).toBe(false);
  });

  it("accepts valid workingHours and rejects malformed HH:MM", () => {
    expect(
      findSchema.safeParse({
        ...WINDOW,
        workingHours: { start: "09:00", end: "17:30" },
      }).success
    ).toBe(true);
    for (const bad of ["9:00", "24:00", "12:60", "0900", "noon"]) {
      expect(
        findSchema.safeParse({
          ...WINDOW,
          workingHours: { start: bad, end: "17:00" },
        }).success
      ).toBe(false);
    }
  });

  it("accepts optional calendars/calendarIds", () => {
    expect(
      findSchema.safeParse({
        ...WINDOW,
        calendars: ["Work"],
        calendarIds: ["CAL-1"],
      }).success
    ).toBe(true);
  });
});

describe("findFreeSlotsSchema (refined: working-hours range)", () => {
  it("rejects inverted working hours (end <= start)", () => {
    const inverted = findFreeSlotsSchema.safeParse({
      ...WINDOW,
      workingHours: { start: "17:00", end: "09:00" },
    });
    expect(inverted.success).toBe(false);
    const equal = findFreeSlotsSchema.safeParse({
      ...WINDOW,
      workingHours: { start: "09:00", end: "09:00" },
    });
    expect(equal.success).toBe(false);
  });

  it("accepts a forward working-hours range and an omitted one", () => {
    expect(
      findFreeSlotsSchema.safeParse({
        ...WINDOW,
        workingHours: { start: "09:00", end: "17:00" },
      }).success
    ).toBe(true);
    expect(findFreeSlotsSchema.safeParse(WINDOW).success).toBe(true);
  });
});

describe("computeFreeSlots", () => {
  it("returns the whole window free when there are no events", () => {
    const slots = computeFreeSlots([], WINDOW);
    expect(instants(slots)).toEqual([
      { start: instant("2026-07-01T09:00:00Z"), end: instant("2026-07-01T17:00:00Z") },
    ]);
  });

  it("merges overlapping and touching busy intervals into one block", () => {
    const slots = computeFreeSlots(
      [
        ev("2026-07-01T10:00:00Z", "2026-07-01T11:00:00Z"),
        ev("2026-07-01T11:00:00Z", "2026-07-01T12:00:00Z"), // touches the first
        ev("2026-07-01T11:30:00Z", "2026-07-01T11:45:00Z"), // overlaps the second
      ],
      WINDOW
    );
    // Busy 10:00–12:00 collapses to one block → two free gaps around it.
    expect(instants(slots)).toEqual([
      { start: instant("2026-07-01T09:00:00Z"), end: instant("2026-07-01T10:00:00Z") },
      { start: instant("2026-07-01T12:00:00Z"), end: instant("2026-07-01T17:00:00Z") },
    ]);
  });

  it("does not emit a zero-length slot between back-to-back events", () => {
    const slots = computeFreeSlots(
      [
        ev("2026-07-01T09:00:00Z", "2026-07-01T10:00:00Z"),
        ev("2026-07-01T10:00:00Z", "2026-07-01T11:00:00Z"),
      ],
      { startDate: "2026-07-01T09:00:00Z", endDate: "2026-07-01T12:00:00Z" }
    );
    expect(instants(slots)).toEqual([
      { start: instant("2026-07-01T11:00:00Z"), end: instant("2026-07-01T12:00:00Z") },
    ]);
  });

  it("drops gaps shorter than the minimum duration", () => {
    const slots = computeFreeSlots(
      [ev("2026-07-01T09:30:00Z", "2026-07-01T10:40:00Z")],
      {
        startDate: "2026-07-01T09:00:00Z",
        endDate: "2026-07-01T11:00:00Z",
        minDurationMinutes: 30,
      }
    );
    // Free gaps: [09:00,09:30] (30 min, kept) and [10:40,11:00] (20 min, dropped).
    expect(instants(slots)).toEqual([
      { start: instant("2026-07-01T09:00:00Z"), end: instant("2026-07-01T09:30:00Z") },
    ]);
  });

  it("ignores all-day events (they do not block timed availability)", () => {
    const slots = computeFreeSlots(
      [
        ev("2026-07-01T00:00:00Z", "2026-07-02T00:00:00Z", { isAllDay: true }),
      ],
      WINDOW
    );
    expect(instants(slots)).toEqual([
      { start: instant("2026-07-01T09:00:00Z"), end: instant("2026-07-01T17:00:00Z") },
    ]);
  });

  it("ignores zero-length events", () => {
    const slots = computeFreeSlots(
      [ev("2026-07-01T12:00:00Z", "2026-07-01T12:00:00Z")],
      WINDOW
    );
    expect(instants(slots)).toEqual([
      { start: instant("2026-07-01T09:00:00Z"), end: instant("2026-07-01T17:00:00Z") },
    ]);
  });

  it("ignores events with an unparseable date instead of crashing", () => {
    // A malformed date yields NaN; it must be skipped (not pushed as a NaN
    // interval that later crashes new Date(NaN).toISOString()).
    const slots = computeFreeSlots(
      [
        ev("not-a-date", "2026-07-01T12:00:00Z"),
        ev("2026-07-01T13:00:00Z", "also-bad"),
      ],
      WINDOW
    );
    expect(instants(slots)).toEqual([
      { start: instant("2026-07-01T09:00:00Z"), end: instant("2026-07-01T17:00:00Z") },
    ]);
  });

  it("clips events that straddle the window boundary", () => {
    const slots = computeFreeSlots(
      // Starts before AND we only treat its in-window portion (11:00–12:00) as busy.
      [ev("2026-07-01T11:00:00Z", "2026-07-01T14:00:00Z")],
      { startDate: "2026-07-01T10:00:00Z", endDate: "2026-07-01T12:00:00Z" }
    );
    expect(instants(slots)).toEqual([
      { start: instant("2026-07-01T10:00:00Z"), end: instant("2026-07-01T11:00:00Z") },
    ]);
  });

  it("only treats events from the selected calendars as busy", () => {
    const events = [
      ev("2026-07-01T10:00:00Z", "2026-07-01T11:00:00Z", {
        calendarTitle: "Work",
        calendarId: "CAL-WORK",
      }),
      ev("2026-07-01T12:00:00Z", "2026-07-01T13:00:00Z", {
        calendarTitle: "Personal",
        calendarId: "CAL-PERSONAL",
      }),
    ];
    // Filter by name (case-insensitive): only Work blocks; Personal is ignored,
    // so 12:00–13:00 stays free inside the 11:00–17:00 block.
    const byName = computeFreeSlots(events, { ...WINDOW, calendars: ["work"] });
    expect(instants(byName)).toEqual([
      { start: instant("2026-07-01T09:00:00Z"), end: instant("2026-07-01T10:00:00Z") },
      { start: instant("2026-07-01T11:00:00Z"), end: instant("2026-07-01T17:00:00Z") },
    ]);
    // Filter by id: only Personal blocks.
    const byId = computeFreeSlots(events, {
      ...WINDOW,
      calendarIds: ["CAL-PERSONAL"],
    });
    expect(instants(byId)).toEqual([
      { start: instant("2026-07-01T09:00:00Z"), end: instant("2026-07-01T12:00:00Z") },
      { start: instant("2026-07-01T13:00:00Z"), end: instant("2026-07-01T17:00:00Z") },
    ]);
  });

  it("treats names and ids as a union when BOTH filters are supplied", () => {
    // Regression for the cross-layer filter bug: when a client passes both a
    // name filter and an id filter, an event is busy if it matches EITHER.
    const events = [
      ev("2026-07-01T10:00:00Z", "2026-07-01T11:00:00Z", {
        calendarTitle: "Work",
        calendarId: "CAL-WORK",
      }),
      ev("2026-07-01T12:00:00Z", "2026-07-01T13:00:00Z", {
        calendarTitle: "Personal",
        calendarId: "CAL-PERSONAL",
      }),
      ev("2026-07-01T14:00:00Z", "2026-07-01T15:00:00Z", {
        calendarTitle: "Other",
        calendarId: "CAL-OTHER",
      }),
    ];
    const slots = computeFreeSlots(events, {
      ...WINDOW,
      calendars: ["Work"],
      calendarIds: ["CAL-PERSONAL"],
    });
    // Work (10–11) AND Personal (12–13) both block; Other (14–15) stays free.
    expect(instants(slots)).toEqual([
      { start: instant("2026-07-01T09:00:00Z"), end: instant("2026-07-01T10:00:00Z") },
      { start: instant("2026-07-01T11:00:00Z"), end: instant("2026-07-01T12:00:00Z") },
      { start: instant("2026-07-01T13:00:00Z"), end: instant("2026-07-01T17:00:00Z") },
    ]);
  });

  it("returns [] for a fully booked window", () => {
    const slots = computeFreeSlots(
      [ev("2026-07-01T09:00:00Z", "2026-07-01T10:00:00Z")],
      { startDate: "2026-07-01T09:00:00Z", endDate: "2026-07-01T10:00:00Z" }
    );
    expect(slots).toEqual([]);
  });

  it("constrains slots to working hours on each local day", () => {
    // This test is structurally timezone-INDEPENDENT (not relying on the suite's
    // TZ pin): the window is built from local calendar components and the
    // assertions read getHours()/getDate() back in the same local zone, so
    // local 09:00/17:00 read as 9/17 on any host. The DST-boundary test below is
    // the one that actually exercises the local-clock anchoring of working hours.
    const startDate = new Date(2026, 6, 1, 0, 0, 0, 0).toISOString(); // Jul 1 local 00:00
    const endDate = new Date(2026, 6, 3, 0, 0, 0, 0).toISOString(); // Jul 3 local 00:00
    const slots = computeFreeSlots([], {
      startDate,
      endDate,
      workingHours: { start: "09:00", end: "17:00" },
    });
    // One slot per local day in the window, each clipped to working hours.
    expect(slots.length).toBe(2);
    for (const slot of slots) {
      const s = new Date(slot.start);
      const e = new Date(slot.end);
      expect(s.getHours()).toBe(9);
      expect(s.getMinutes()).toBe(0);
      expect(e.getHours()).toBe(17);
      expect(e.getMinutes()).toBe(0);
    }
    // Distinct local days.
    expect(new Date(slots[0].start).getDate()).toBe(1);
    expect(new Date(slots[1].start).getDate()).toBe(2);
  });

  it("anchors working hours to the local clock across a DST transition day", () => {
    // 2026-11-01 (Sunday) is the America/New_York fall-back DST day (25-hour
    // local day; the repeated hour is 01:00–02:00, i.e. BEFORE working hours).
    // The suite pins TZ=America/New_York, so this exercises the real local-clock
    // path: working hours land on local 09:00/17:00 in EST (UTC-5), proving the
    // clip uses that date's actual offset rather than the summer EDT (UTC-4).
    const startDate = new Date(2026, 10, 1, 0, 0, 0, 0).toISOString(); // Nov 1 local 00:00
    const endDate = new Date(2026, 10, 2, 0, 0, 0, 0).toISOString(); // Nov 2 local 00:00
    const slots = computeFreeSlots([], {
      startDate,
      endDate,
      workingHours: { start: "09:00", end: "17:00" },
    });
    expect(slots.length).toBe(1);
    const s = new Date(slots[0].start);
    const e = new Date(slots[0].end);
    // Local clock: 09:00–17:00 on Nov 1.
    expect(s.getHours()).toBe(9);
    expect(e.getHours()).toBe(17);
    expect(s.getDate()).toBe(1);
    // EST offset (UTC-5) for this date: local 09:00 → 14:00Z, not 13:00Z (EDT).
    // This is the assertion that the TZ pin makes load-bearing — it would differ
    // on a UTC host, and a fixed-offset bug would land on the wrong UTC hour.
    expect(s.getUTCHours()).toBe(14);
    expect(e.getUTCHours()).toBe(22);
  });

  it("anchors working hours to the local clock across a spring-forward DST day", () => {
    // 2026-03-08 (Sunday) is the America/New_York spring-forward day (23-hour
    // local day; 02:00→03:00 does not exist). Working hours sit AFTER the gap, so
    // they must land on EDT (UTC-4), not the pre-transition EST. This is the
    // mirror of the fall-back test above, guarding BOTH DST directions.
    const startDate = new Date(2026, 2, 8, 0, 0, 0, 0).toISOString(); // Mar 8 local 00:00
    const endDate = new Date(2026, 2, 9, 0, 0, 0, 0).toISOString(); // Mar 9 local 00:00
    const slots = computeFreeSlots([], {
      startDate,
      endDate,
      workingHours: { start: "09:00", end: "17:00" },
    });
    expect(slots.length).toBe(1);
    const s = new Date(slots[0].start);
    const e = new Date(slots[0].end);
    // Local clock: 09:00–17:00 on Mar 8.
    expect(s.getHours()).toBe(9);
    expect(e.getHours()).toBe(17);
    expect(s.getDate()).toBe(8);
    // EDT offset (UTC-4) after the spring-forward: local 09:00 → 13:00Z (not
    // 14:00Z, which would be the pre-transition EST a fixed-offset bug would use).
    expect(s.getUTCHours()).toBe(13);
    expect(e.getUTCHours()).toBe(21);
  });

  it("returns [] when the window start is not before the window end", () => {
    expect(
      computeFreeSlots([], {
        startDate: "2026-07-01T17:00:00Z",
        endDate: "2026-07-01T09:00:00Z",
      })
    ).toEqual([]);
  });

  it("emits slot timestamps with the server-local offset, not a UTC Z", () => {
    // The suite pins TZ=America/New_York, which is EDT (UTC-04:00) on Jul 1.
    // computeFreeSlots output therefore carries -04:00, mirroring the Swift
    // bridge's local-offset formatISO8601 — never a bare `Z`. The instant is
    // unchanged (asserted on the parsed value, above-style), and the format
    // carries the local offset.
    const [slot] = computeFreeSlots([], WINDOW);
    expect(new Date(slot.start).getTime()).toBe(instant("2026-07-01T09:00:00Z"));
    expect(new Date(slot.end).getTime()).toBe(instant("2026-07-01T17:00:00Z"));
    expect(slot.start).toMatch(/-04:00$/);
    expect(slot.end).toMatch(/-04:00$/);
    expect(slot.start).not.toMatch(/Z$/);
  });
});

describe("canonicalizeDateArg (find_free_slots window)", () => {
  it("expands a date-only value to naive local midnight (matches the bridge, not UTC)", () => {
    expect(canonicalizeDateArg("2026-07-01")).toBe("2026-07-01T00:00:00");
    // The canonicalized form parses to LOCAL midnight — the same instant the
    // bridge resolves a date-only value to — not UTC midnight. (Under the suite's
    // America/New_York pin these differ by the offset.)
    const canonical = new Date(canonicalizeDateArg("2026-07-01")).getTime();
    const localMidnight = new Date(2026, 6, 1, 0, 0, 0, 0).getTime();
    expect(canonical).toBe(localMidnight);
    // Guard: the RAW date-only form is UTC midnight — the day-shift this fixes.
    expect(new Date("2026-07-01").getTime()).not.toBe(localMidnight);
  });

  it("passes offset-bearing, naive, and HH:mm datetimes through unchanged", () => {
    for (const s of [
      "2026-07-01T09:00:00Z",
      "2026-07-01T09:00:00+02:00",
      "2026-07-01T09:00:00",
      "2026-07-01T09:00:00.500",
      "2026-07-01T09:00",
    ]) {
      expect(canonicalizeDateArg(s)).toBe(s);
    }
  });
});

describe("formatLocalISO", () => {
  it("renders ±HH:MM for a non-zero offset and Z for a zero offset", () => {
    const ms = Date.UTC(2026, 6, 1, 8, 0, 0); // 2026-07-01T08:00:00Z
    // The +120 literal is the cross-language mirror: Swift's ModelsTests
    // ("output matches the TS formatLocalISO shape byte-for-byte") asserts this
    // exact string for the same instant, so the two formatters cannot diverge.
    expect(formatLocalISO(ms, 120)).toBe("2026-07-01T10:00:00.000+02:00");
    expect(formatLocalISO(ms, 0)).toBe("2026-07-01T08:00:00.000Z");
    expect(formatLocalISO(ms, -240)).toBe("2026-07-01T04:00:00.000-04:00");
  });

  it("round-trips: a formatted instant reparses to the same instant", () => {
    const ms = Date.UTC(2026, 6, 1, 8, 0, 0);
    expect(new Date(formatLocalISO(ms, 120)).getTime()).toBe(ms);
    expect(new Date(formatLocalISO(ms, 0)).getTime()).toBe(ms);
    expect(new Date(formatLocalISO(ms, -240)).getTime()).toBe(ms);
    // Default (host) offset path under the suite's TZ pin.
    expect(new Date(formatLocalISO(ms)).getTime()).toBe(ms);
  });
});
