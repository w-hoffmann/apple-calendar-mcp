import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { chmodSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
// Tests run against the compiled output in build/ (see the "test" script).
import { SwiftBridge } from "../build/bridge/swift.js";

// Absolute path to the fake-bridge fixture. SwiftBridge reads APPLE_BRIDGE_BIN
// and execa spawns it directly; the fixture's shebang (#!/usr/bin/env node)
// runs it under node. We chmod it +x in beforeAll so the exec bit can never
// drift across a CI checkout.
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures", "fake-bridge.mjs");

function setMode(mode: string): void {
  process.env.FAKE_BRIDGE_MODE = mode;
}

beforeAll(() => {
  process.env.APPLE_BRIDGE_BIN = FIXTURE;
  chmodSync(FIXTURE, 0o755);
});

afterEach(() => {
  delete process.env.FAKE_BRIDGE_MODE;
});

afterAll(() => {
  // Make isolation explicit and execution-order independent: this suite is the
  // only one that points APPLE_BRIDGE_BIN at the fixture, so clear it after.
  delete process.env.APPLE_BRIDGE_BIN;
});

describe("SwiftBridge contract against the fake binary", () => {
  it("parses a success envelope and returns the data payload", async () => {
    setMode("ok");
    const bridge = new SwiftBridge();
    const calendars = await bridge.calendars();
    expect(Array.isArray(calendars)).toBe(true);
    expect(calendars[0]?.id).toBe("FAKE-CAL-1");
    expect(calendars[0]?.title).toBe("Fake Calendar");
  });

  it("surfaces the error message from an error envelope", async () => {
    setMode("error");
    const bridge = new SwiftBridge();
    await expect(bridge.calendars()).rejects.toThrow(
      "fake bridge failure message"
    );
  });

  it("rejects malformed output with a clear parse error", async () => {
    setMode("malformed-json");
    const bridge = new SwiftBridge();
    await expect(bridge.calendars()).rejects.toThrow(
      /Failed to parse apple-bridge output/
    );
  });

  it("rejects empty stdout (exit 0, no output) with a parse error", async () => {
    setMode("empty-stdout");
    const bridge = new SwiftBridge();
    await expect(bridge.calendars()).rejects.toThrow(
      /Failed to parse apple-bridge output/
    );
  });

  it("surfaces a non-zero exit with no stdout", async () => {
    setMode("nonzero-exit");
    const bridge = new SwiftBridge();
    await expect(bridge.calendars()).rejects.toThrow(/apple-bridge failed/);
  });

  it("hits the configured timeout when the binary hangs", async () => {
    setMode("hang");
    // Inject a 50 ms timeout so the hang path resolves near-instantly instead
    // of waiting the 30s default.
    const bridge = new SwiftBridge({ timeoutMs: 50 });
    const started = Date.now();
    // Assert the timeout-specific error (not just "any rejection"), so a future
    // regression that swallows the timeout into a generic message is caught.
    await expect(bridge.calendars()).rejects.toThrow(/timed out after 50ms/);
    // And that the injected timeout fired rather than the binary returning.
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("caps oversized output instead of consuming unbounded memory", async () => {
    setMode("oversized");
    // 1 KB buffer; the fixture emits 256 KB.
    const bridge = new SwiftBridge({ maxBuffer: 1024 });
    // Assert the buffer-limit-specific error, not a misleading parse error.
    await expect(bridge.calendars()).rejects.toThrow(
      /exceeded the 1024-byte buffer limit/
    );
  });

  it("passes create-event recurrence flags and returns the lean event shape", async () => {
    setMode("ok");
    const bridge = new SwiftBridge();
    const event = await bridge.createEvent({
      calendarId: "C1",
      title: "Standup",
      startDate: "2026-07-01T10:00:00Z",
      endDate: "2026-07-01T11:00:00Z",
      recurrence: { frequency: "weekly", interval: 2, daysOfWeek: ["MO"] },
    });
    // The fake echoes hasRecurrenceRules: true because --recurrence-frequency
    // reached the binary. (Only the frequency flag is observably checked
    // end-to-end here; the full interval/daysOfWeek arg mapping is covered
    // structurally by buildCreateArgs in swift-args.test.ts.)
    expect(event.hasRecurrenceRules).toBe(true);
    expect(event.title).toBe("Standup");
    expect(event.calendarId).toBe("C1");
    // Lean mapping: dead-weight fields dropped, null optionals omitted.
    expect("externalId" in event).toBe(false);
    expect("isDetached" in event).toBe(false);
    expect("timeZone" in event).toBe(false);
    expect("location" in event).toBe(false);
    expect("notes" in event).toBe(false);
    expect("occurrenceDate" in event).toBe(false);
    // Identity/operational fields always present.
    expect(event.isAllDay).toBe(false);
    expect(typeof event.startDate).toBe("string");
    expect(typeof event.endDate).toBe("string");
  });
});
