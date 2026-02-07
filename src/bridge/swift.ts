import { execa } from "execa";

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

export class SwiftBridge {
  private binPath: string;

  constructor() {
    const envPath = process.env.APPLE_BRIDGE_BIN;
    if (!envPath) {
      throw new Error(
        "APPLE_BRIDGE_BIN environment variable is not set. " +
          "Set it to the path of the apple-bridge binary."
      );
    }
    this.binPath = envPath;
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

    const output: BridgeOutput<T> = JSON.parse(result.stdout);

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

  async events(opts: {
    startDate: string;
    endDate: string;
    calendars?: string[];
    calendarIds?: string[];
  }): Promise<EventInfo[]> {
    const args = ["events", "--start", opts.startDate, "--end", opts.endDate];
    if (opts.calendars?.length) {
      args.push("--calendars", ...opts.calendars);
    }
    if (opts.calendarIds?.length) {
      args.push("--calendar-ids", ...opts.calendarIds);
    }
    return this.exec<EventInfo[]>(args);
  }

  async today(): Promise<EventInfo[]> {
    return this.exec<EventInfo[]>(["today"]);
  }

  async createEvent(opts: {
    calendarId: string;
    title: string;
    startDate: string;
    endDate: string;
    timeZone?: string;
    allDay?: boolean;
    location?: string;
    notes?: string;
  }): Promise<EventInfo> {
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
    return this.exec<EventInfo>(args);
  }

  async deleteEvent(opts: {
    eventId: string;
    span: "this" | "all";
    occurrenceDate?: string;
  }): Promise<string> {
    const args = [
      "delete-event",
      "--id",
      opts.eventId,
      "--span",
      opts.span,
    ];
    if (opts.occurrenceDate) args.push("--occurrence", opts.occurrenceDate);
    return this.exec<string>(args);
  }
}
