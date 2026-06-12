// E2E helpers. NOT a *.test.ts file, so vitest never collects it as a suite.
//
// These wrap the real apple-bridge binary for the hidden `test-calendar`
// subcommands (which SwiftBridge intentionally does not expose) and resolve the
// binary path so the real SwiftBridge used by the MCP client and these helpers
// agree on which binary to run.
import { execa } from "execa";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Absolute path to the built release binary (test/e2e → repo root → swift/...).
export const BRIDGE_BIN =
  process.env.APPLE_BRIDGE_BIN ??
  join(__dirname, "..", "..", "swift", ".build", "release", "apple-bridge");

// Ensure the real SwiftBridge (constructed by the MCP server) uses the same
// binary as the helpers below.
process.env.APPLE_BRIDGE_BIN = BRIDGE_BIN;

export const MARKER_PREFIX = "MCP-E2E-";

async function runBridge<T>(args: string[]): Promise<T> {
  const result = await execa(BRIDGE_BIN, args, { reject: false });
  if (result.exitCode !== 0 && !result.stdout) {
    throw new Error(
      `apple-bridge failed (exit ${result.exitCode}): ${result.stderr}`
    );
  }
  const out = JSON.parse(result.stdout) as {
    status: string;
    data?: T;
    error?: string;
  };
  if (out.status === "error") {
    throw new Error(out.error ?? "Unknown bridge error");
  }
  return out.data as T;
}

export interface CalendarInfo {
  id: string;
  title: string;
}

export async function createTestCalendar(name: string): Promise<CalendarInfo> {
  return runBridge<CalendarInfo>(["test-calendar", "create", "--name", name]);
}

export async function deleteTestCalendar(name: string): Promise<void> {
  await runBridge(["test-calendar", "delete", "--name", name]);
}

export async function listCalendars(): Promise<CalendarInfo[]> {
  return runBridge<CalendarInfo[]>(["calendars"]);
}

export async function calendarAccess(): Promise<string> {
  const diag = await runBridge<{ calendarAccess: string }>(["doctor"]);
  return diag.calendarAccess;
}

/** Delete every marker calendar left over from a previous crashed run. */
export async function sweepLeftoverMarkers(): Promise<void> {
  const cals = await listCalendars();
  const leftovers = cals.filter((c) => c.title.startsWith(MARKER_PREFIX));
  for (const c of leftovers) {
    await deleteTestCalendar(c.title);
  }
}
