import { execa } from "execa";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Mirror of Swift models

export interface CalendarInfo {
  id: string;
  title: string;
  type: string;
  source: string;
  color: string;
  isImmutable: boolean;
}

export interface EventInfo {
  id: string;
  externalId: string | null;
  calendarId: string;
  calendarTitle: string;
  title: string;
  startDate: string;
  endDate: string;
  timeZone: string | null;
  isAllDay: boolean;
  hasRecurrenceRules: boolean;
  occurrenceDate: string | null;
  isDetached: boolean;
  location: string | null;
  notes: string | null;
}

export interface DiagnosticsInfo {
  calendarAccess: string;
  calendarCount: number;
  sources: string[];
  macOSVersion: string;
}

interface BridgeOutput<T> {
  status: "ok" | "error";
  data?: T;
  error?: string;
}

export interface EventsOpts {
  startDate: string;
  endDate: string;
  calendars?: string[];
  calendarIds?: string[];
}

export interface CreateEventOpts {
  calendarId: string;
  title: string;
  startDate: string;
  endDate: string;
  timeZone?: string;
  allDay?: boolean;
  location?: string;
  notes?: string;
}

export interface UpdateEventOpts {
  eventId: string;
  span?: "this" | "future";
  occurrenceDate?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  timeZone?: string;
  allDay?: boolean;
  location?: string;
  notes?: string;
  calendarId?: string;
}

// --- Pure CLI argument builders (exported for unit tests) -----------------

export function buildEventsArgs(opts: EventsOpts): string[] {
  const args = ["events", "--start", opts.startDate, "--end", opts.endDate];
  if (opts.calendars?.length) args.push("--calendars", ...opts.calendars);
  if (opts.calendarIds?.length) args.push("--calendar-ids", ...opts.calendarIds);
  return args;
}

export function buildCreateArgs(opts: CreateEventOpts): string[] {
  const args = [
    "create-event",
    "--calendar-id",
    opts.calendarId,
    "--title",
    opts.title,
    "--start",
    opts.startDate,
    "--end",
    opts.endDate,
  ];
  if (opts.timeZone) args.push("--time-zone", opts.timeZone);
  if (opts.allDay) args.push("--all-day");
  if (opts.location) args.push("--location", opts.location);
  if (opts.notes) args.push("--notes", opts.notes);
  return args;
}

export function buildUpdateArgs(opts: UpdateEventOpts): string[] {
  const args = ["update-event", "--id", opts.eventId];
  if (opts.span) args.push("--span", opts.span);
  if (opts.occurrenceDate) args.push("--occurrence", opts.occurrenceDate);
  if (opts.title !== undefined) args.push("--title", opts.title);
  if (opts.startDate) args.push("--start", opts.startDate);
  if (opts.endDate) args.push("--end", opts.endDate);
  if (opts.timeZone) args.push("--time-zone", opts.timeZone);
  if (opts.allDay === true) args.push("--all-day");
  if (opts.allDay === false) args.push("--no-all-day");
  if (opts.location !== undefined) args.push("--location", opts.location);
  if (opts.notes !== undefined) args.push("--notes", opts.notes);
  if (opts.calendarId) args.push("--calendar-id", opts.calendarId);
  return args;
}

export class SwiftBridge {
  private binPath: string;

  constructor() {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    this.binPath =
      process.env.APPLE_BRIDGE_BIN ??
      join(__dirname, "..", "swift", ".build", "release", "apple-bridge");
  }

  private async exec<T>(args: string[]): Promise<T> {
    const result = await execa(this.binPath, args, {
      reject: false,
      timeout: 30_000,
    });

    if (result.exitCode !== 0 && !result.stdout) {
      throw new Error(
        `apple-bridge failed (exit ${result.exitCode}): ${result.stderr}`
      );
    }

    let output: BridgeOutput<T>;
    try {
      output = JSON.parse(result.stdout);
    } catch {
      throw new Error(
        `Failed to parse apple-bridge output: ${result.stdout.slice(0, 500)}`
      );
    }

    if (output.status === "error") {
      throw new Error(output.error ?? "Unknown bridge error");
    }

    return output.data as T;
  }

  async doctor(): Promise<DiagnosticsInfo> {
    return this.exec<DiagnosticsInfo>(["doctor"]);
  }

  async calendars(): Promise<CalendarInfo[]> {
    return this.exec<CalendarInfo[]>(["calendars"]);
  }

  async events(opts: EventsOpts): Promise<EventInfo[]> {
    return this.exec<EventInfo[]>(buildEventsArgs(opts));
  }

  async today(): Promise<EventInfo[]> {
    return this.exec<EventInfo[]>(["today"]);
  }

  async createEvent(opts: CreateEventOpts): Promise<EventInfo> {
    return this.exec<EventInfo>(buildCreateArgs(opts));
  }

  async updateEvent(opts: UpdateEventOpts): Promise<EventInfo> {
    return this.exec<EventInfo>(buildUpdateArgs(opts));
  }
}
