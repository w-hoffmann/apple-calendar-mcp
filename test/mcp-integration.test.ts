import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { chmodSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
// Tests run against the compiled output in build/ (see the "test" script).
import { registerCalendarTools } from "../build/tools/calendar.js";
import { SwiftBridge } from "../build/bridge/swift.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures", "fake-bridge.mjs");

// A faked bridge that records calls, so a test can assert the bridge was (or
// was not) invoked. Methods return canned values shaped like the real ones.
function makeFakeBridge() {
  const calls: { method: string; args: unknown }[] = [];
  const record =
    (method: string, ret: (args: unknown) => unknown) => async (args: unknown) => {
      calls.push({ method, args });
      return ret(args);
    };
  const bridge = {
    calls,
    calendars: record("calendars", () => [
      { id: "C1", title: "Home", type: "local", source: "Local", color: "#000000", isImmutable: false },
    ]),
    events: record("events", () => []),
    createEvent: record("createEvent", (a: any) => ({ id: "EVT-1", title: a.title })),
    updateEvent: record("updateEvent", (a: any) => ({ id: a.eventId, title: a.title ?? "x" })),
  };
  return bridge;
}

async function linkClient(bridge: unknown): Promise<Client> {
  const server = new McpServer({ name: "apple-calendar", version: "test" });
  registerCalendarTools(server, bridge as any);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "test" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

describe("MCP integration via InMemoryTransport", () => {
  it("exposes the 6-tool surface (no get_today_events; with find_free_slots)", async () => {
    const client = await linkClient(makeFakeBridge());
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "create_event",
        "find_free_slots",
        "get_calendars",
        "get_events",
        "search_events",
        "update_event",
      ].sort()
    );
    expect(names).not.toContain("get_today_events");
    // Every tool advertises an input schema object (the SDK always emits one).
    for (const t of tools) {
      expect(t.inputSchema).toBeDefined();
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("advertises honest annotations and titles per tool", async () => {
    const client = await linkClient(makeFakeBridge());
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

    for (const name of [
      "get_calendars",
      "get_events",
      "search_events",
      "find_free_slots",
    ]) {
      expect(byName[name].annotations?.readOnlyHint).toBe(true);
      expect(byName[name].title || byName[name].annotations?.title).toBeTruthy();
    }
    for (const name of ["create_event", "update_event"]) {
      expect(byName[name].annotations?.readOnlyHint).toBe(false);
    }
    expect(byName.update_event.annotations?.destructiveHint).toBe(true);
    // create_event must advertise destructiveHint EXPLICITLY false (omitting it
    // defaults to true under MCP spec 2025-11-25 when readOnlyHint is false).
    expect(byName.create_event.annotations?.destructiveHint).toBe(false);
  });

  it("find_free_slots returns a compact JSON array of slots", async () => {
    const bridge = makeFakeBridge(); // events() returns [] → whole window free
    const client = await linkClient(bridge);
    const res = await client.callTool({
      name: "find_free_slots",
      arguments: {
        startDate: "2026-07-01T09:00:00Z",
        endDate: "2026-07-01T17:00:00Z",
      },
    });
    expect(res.isError).toBeFalsy();
    const content = res.content as { type: string; text: string }[];
    // wrap() uses JSON.stringify with no indent, so the exact contract is "no
    // newline at all" (stronger than just rejecting two-space indentation).
    expect(content[0].text).not.toMatch(/\n/);
    const slots = JSON.parse(content[0].text);
    expect(Array.isArray(slots)).toBe(true);
    expect(slots[0]).toEqual({
      start: "2026-07-01T09:00:00.000Z",
      end: "2026-07-01T17:00:00.000Z",
    });
    expect(bridge.calls.map((c) => c.method)).toContain("events");
  });

  it("find_free_slots fetches the full window (no bridge-side calendar filter)", async () => {
    // The calendar filter is applied solely in computeFreeSlots (names-OR-ids
    // union), so the bridge must be asked for the FULL window — otherwise the
    // Swift names-XOR-ids filter would silently drop id-matched busy events.
    const bridge = makeFakeBridge();
    const client = await linkClient(bridge);
    const res = await client.callTool({
      name: "find_free_slots",
      arguments: {
        startDate: "2026-07-01T09:00:00Z",
        endDate: "2026-07-01T17:00:00Z",
        calendars: ["Work"],
        calendarIds: ["CAL-PERSONAL"],
      },
    });
    expect(res.isError).toBeFalsy();
    const eventsCall = bridge.calls.find((c) => c.method === "events");
    expect(eventsCall).toBeDefined();
    const passed = eventsCall!.args as Record<string, unknown>;
    expect(passed.calendars).toBeUndefined();
    expect(passed.calendarIds).toBeUndefined();
  });

  it("find_free_slots surfaces an underlying read failure as an error result", async () => {
    // Spec "Surface availability failures": a rejecting events() read must yield
    // isError:true with the message surfaced, not misleading (empty) availability.
    const bridge = makeFakeBridge();
    bridge.events = (async () => {
      throw new Error("calendar access denied");
    }) as typeof bridge.events;
    const client = await linkClient(bridge);
    const res = await client.callTool({
      name: "find_free_slots",
      arguments: {
        startDate: "2026-07-01T09:00:00Z",
        endDate: "2026-07-01T17:00:00Z",
      },
    });
    expect(res.isError).toBe(true);
    const text = (res.content as { text: string }[])[0].text;
    expect(text).toContain("calendar access denied");
  });

  it("round-trips a valid tool call and returns the shaped result", async () => {
    const bridge = makeFakeBridge();
    const client = await linkClient(bridge);
    const res = await client.callTool({ name: "get_calendars", arguments: {} });
    expect(res.isError).toBeFalsy();
    const content = res.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed[0].title).toBe("Home");
    expect(bridge.calls.map((c) => c.method)).toContain("calendars");
  });

  it("passes valid create_event arguments through to the bridge", async () => {
    const bridge = makeFakeBridge();
    const client = await linkClient(bridge);
    const res = await client.callTool({
      name: "create_event",
      arguments: {
        calendarId: "C1",
        title: "Standup",
        startDate: "2026-07-01T10:00:00Z",
        endDate: "2026-07-01T11:00:00Z",
      },
    });
    expect(res.isError).toBeFalsy();
    const create = bridge.calls.find((c) => c.method === "createEvent");
    expect(create).toBeDefined();
    expect((create!.args as any).title).toBe("Standup");
  });

  it("rejects schema-invalid arguments without invoking the bridge", async () => {
    const bridge = makeFakeBridge();
    const client = await linkClient(bridge);
    // Empty title violates createEventInput's .min(1). The MCP SDK (1.26)
    // validates the input schema before the handler runs and returns an error
    // *result* (isError: true, JSON-RPC -32602 "Input validation error") rather
    // than rejecting the call — so callTool resolves, it does not throw.
    const res = await client.callTool({
      name: "create_event",
      arguments: {
        calendarId: "C1",
        title: "",
        startDate: "2026-07-01T10:00:00Z",
        endDate: "2026-07-01T11:00:00Z",
      },
    });
    expect(res.isError).toBe(true);
    const text = (res.content as { text: string }[])[0].text.toLowerCase();
    expect(text).toMatch(/validation|invalid/);
    // The core safety contract: the bridge was never reached.
    expect(bridge.calls.length).toBe(0);
  });
});

describe("MCP integration full path through a real SwiftBridge", () => {
  beforeAll(() => {
    chmodSync(FIXTURE, 0o755);
  });

  afterEach(() => {
    delete process.env.APPLE_BRIDGE_BIN;
    delete process.env.FAKE_BRIDGE_MODE;
  });

  it("derives the result from the fake binary's envelope", async () => {
    process.env.APPLE_BRIDGE_BIN = FIXTURE;
    process.env.FAKE_BRIDGE_MODE = "ok";
    const client = await linkClient(new SwiftBridge());
    const res = await client.callTool({ name: "get_calendars", arguments: {} });
    expect(res.isError).toBeFalsy();
    const content = res.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed[0].id).toBe("FAKE-CAL-1");
    expect(parsed[0].title).toBe("Fake Calendar");
  });
});
