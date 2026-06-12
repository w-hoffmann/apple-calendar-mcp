import AppleBridgeCore
import ArgumentParser
import EventKit
import Foundation

@main
struct AppleBridge: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "apple-bridge",
        abstract: "EventKit bridge for MCP server",
        subcommands: [
            Doctor.self,
            Calendars.self,
            Events.self,
            Today.self,
            CreateEvent.self,
            UpdateEvent.self,
            TestCalendarCommand.self,
        ]
    )
}

// MARK: - Doctor

struct Doctor: ParsableCommand {
    static let configuration = CommandConfiguration(abstract: "Show diagnostics")

    func run() {
        let service = CalendarService()
        let info = service.diagnostics()
        printJSON(BridgeOutput.success(info))
    }
}

// MARK: - Calendars

struct Calendars: AsyncParsableCommand {
    static let configuration = CommandConfiguration(abstract: "List calendars")

    func run() async {
        let service = CalendarService()
        do {
            try await service.requestAccess()
            let calendars = service.listCalendars()
            printJSON(BridgeOutput.success(calendars))
        } catch {
            printError(error.localizedDescription)
        }
    }
}

// MARK: - Events

struct Events: AsyncParsableCommand {
    static let configuration = CommandConfiguration(abstract: "List events in date range")

    @Option(help: "Start date (ISO8601)")
    var start: String

    @Option(help: "End date (ISO8601)")
    var end: String

    @Option(name: .long, parsing: .upToNextOption, help: "Filter by calendar names")
    var calendars: [String] = []

    @Option(name: .customLong("calendar-ids"), parsing: .upToNextOption, help: "Filter by calendar IDs")
    var calendarIds: [String] = []

    func run() async {
        let service = CalendarService()
        do {
            let startDate = try parseISO8601(start)
            let endDate = try parseISO8601(end)
            try await service.requestAccess()
            let events = service.fetchEvents(
                start: startDate,
                end: endDate,
                calendarNames: calendars.isEmpty ? nil : calendars,
                calendarIds: calendarIds.isEmpty ? nil : calendarIds
            )
            printJSON(BridgeOutput.success(events))
        } catch {
            printError(error.localizedDescription)
        }
    }
}

// MARK: - Today

struct Today: AsyncParsableCommand {
    static let configuration = CommandConfiguration(abstract: "List today's events")

    func run() async {
        let service = CalendarService()
        do {
            try await service.requestAccess()
            let events = service.todayEvents()
            printJSON(BridgeOutput.success(events))
        } catch {
            printError(error.localizedDescription)
        }
    }
}

// MARK: - Create Event

struct CreateEvent: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "create-event",
        abstract: "Create a new event"
    )

    @Option(name: .customLong("calendar-id"), help: "Calendar ID")
    var calendarId: String

    @Option(help: "Event title")
    var title: String

    @Option(help: "Start date (ISO8601)")
    var start: String

    @Option(help: "End date (ISO8601)")
    var end: String

    @Option(name: .customLong("time-zone"), help: "Time zone identifier")
    var timeZone: String?

    @Flag(name: .customLong("all-day"), help: "All-day event")
    var allDay: Bool = false

    @Option(help: "Location")
    var location: String?

    @Option(help: "Notes")
    var notes: String?

    @Option(name: .customLong("recurrence-frequency"), help: "Recurrence frequency: daily/weekly/monthly/yearly")
    var recurrenceFrequency: String?

    @Option(name: .customLong("recurrence-interval"), help: "Recurrence interval (>= 1, default 1)")
    var recurrenceInterval: Int?

    @Option(name: .customLong("recurrence-end-date"), help: "Recurrence end date (ISO8601)")
    var recurrenceEndDate: String?

    @Option(name: .customLong("recurrence-count"), help: "Recurrence occurrence count (>= 1)")
    var recurrenceCount: Int?

    @Option(name: .customLong("recurrence-days"), parsing: .upToNextOption, help: "Weekly recurrence weekdays: MO TU WE TH FR SA SU")
    var recurrenceDays: [String] = []

    func run() async {
        let service = CalendarService()
        do {
            let startDate = try parseISO8601(start)
            let endDate = try parseISO8601(end)
            // Validate recurrence (and parse its end date) before requesting
            // access, so bad recurrence input fails fast without touching TCC.
            // Recurrence is active iff a frequency is given. Refuse orphaned
            // sub-flags (interval/count/end-date/days without a frequency) rather
            // than silently dropping the caller's recurrence intent on the
            // direct-CLI path (the MCP arg builder always pairs them).
            if recurrenceFrequency == nil
                && (recurrenceInterval != nil
                    || recurrenceCount != nil
                    || recurrenceEndDate != nil
                    || !recurrenceDays.isEmpty)
            {
                throw BridgeError.invalidInput(
                    "Recurrence options (--recurrence-interval/--recurrence-count/--recurrence-end-date/--recurrence-days) require --recurrence-frequency."
                )
            }
            let recurrence: RecurrenceSpec? = try recurrenceFrequency.map { freq in
                let recEndDate = try recurrenceEndDate.map { try parseISO8601($0) }
                return try RecurrenceValidation.makeSpec(
                    frequency: freq,
                    interval: recurrenceInterval,
                    endDate: recEndDate,
                    occurrenceCount: recurrenceCount,
                    daysOfWeek: recurrenceDays
                )
            }
            try await service.requestAccess()
            let event = try service.createEvent(
                calendarId: calendarId,
                title: title,
                startDate: startDate,
                endDate: endDate,
                timeZone: timeZone,
                isAllDay: allDay,
                location: location,
                notes: notes,
                recurrence: recurrence
            )
            printJSON(BridgeOutput.success(event))
        } catch {
            printError(error.localizedDescription)
        }
    }
}

// MARK: - Update Event

struct UpdateEvent: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "update-event",
        abstract: "Update an existing event"
    )

    @Option(help: "Event ID")
    var id: String

    @Option(help: "Span: this or future (default: this)")
    var span: String = "this"

    @Option(help: "Occurrence date for recurring events (ISO8601)")
    var occurrence: String?

    @Option(help: "New title")
    var title: String?

    @Option(help: "New start date (ISO8601)")
    var start: String?

    @Option(help: "New end date (ISO8601)")
    var end: String?

    @Option(name: .customLong("time-zone"), help: "New time zone identifier")
    var timeZone: String?

    @Flag(name: .customLong("all-day"), help: "Mark as all-day event")
    var allDay: Bool = false

    @Flag(name: .customLong("no-all-day"), help: "Mark as non-all-day event")
    var noAllDay: Bool = false

    @Option(help: "New location")
    var location: String?

    @Option(help: "New notes")
    var notes: String?

    @Option(name: .customLong("calendar-id"), help: "Move event to calendar with this ID")
    var calendarId: String?

    func run() async {
        let service = CalendarService()
        do {
            // Pure argument validation first — independent of calendar access,
            // so bad input fails fast (and is testable without TCC).
            let ekSpan: EKSpan = try Validation.parseSpan(span) == .future
                ? .futureEvents
                : .thisEvent

            let isAllDayOpt: Bool?
            if allDay && noAllDay {
                throw BridgeError.invalidInput("Cannot specify both --all-day and --no-all-day.")
            } else if allDay { isAllDayOpt = true }
            else if noAllDay { isAllDayOpt = false }
            else { isAllDayOpt = nil }

            let occDate = try occurrence.map { try parseISO8601($0) }
            let startDate = try start.map { try parseISO8601($0) }
            let endDate = try end.map { try parseISO8601($0) }

            try await service.requestAccess()
            let event = try service.updateEvent(
                eventId: id,
                span: ekSpan,
                occurrenceDate: occDate,
                title: title,
                startDate: startDate,
                endDate: endDate,
                timeZone: timeZone,
                isAllDay: isAllDayOpt,
                location: location,
                notes: notes,
                calendarId: calendarId
            )
            printJSON(BridgeOutput.success(event))
        } catch {
            printError(error.localizedDescription)
        }
    }
}

// MARK: - Test Calendar (hidden E2E helper)

// Not an MCP tool and hidden from `--help` (shouldDisplay: false). Used only by
// the opt-in E2E suite to create/delete its own ephemeral marker calendars. The
// marker-prefix guard lives in Swift (AppleBridgeCore) and runs before any
// EventKit call, so this can never touch a pre-existing calendar.

struct TestCalendarCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "test-calendar",
        abstract: "Hidden E2E helper: manage ephemeral marker calendars",
        shouldDisplay: false,
        subcommands: [TestCalendarCreate.self, TestCalendarDelete.self]
    )
}

struct TestCalendarCreate: AsyncParsableCommand {
    static let configuration = CommandConfiguration(commandName: "create")

    @Option(help: "Marker calendar name (must start with MCP-E2E-)")
    var name: String

    func run() async {
        let service = CalendarService()
        do {
            // Refuse non-marker names before requesting access or touching
            // EventKit (the service guards again, defense in depth).
            guard TestCalendar.isValidTestCalendarName(name) else {
                throw BridgeError.invalidInput(
                    "Refusing non-marker calendar name: \(name). Must start with \(TestCalendar.markerPrefix)."
                )
            }
            try await service.requestAccess()
            let info = try service.createTestCalendar(name: name)
            printJSON(BridgeOutput.success(info))
        } catch {
            printError(error.localizedDescription)
        }
    }
}

struct TestCalendarDelete: AsyncParsableCommand {
    static let configuration = CommandConfiguration(commandName: "delete")

    @Option(help: "Marker calendar name (must start with MCP-E2E-)")
    var name: String

    func run() async {
        let service = CalendarService()
        do {
            guard TestCalendar.isValidTestCalendarName(name) else {
                throw BridgeError.invalidInput(
                    "Refusing non-marker calendar name: \(name). Must start with \(TestCalendar.markerPrefix)."
                )
            }
            try await service.requestAccess()
            try service.deleteTestCalendar(name: name)
            printJSON(BridgeOutput<String>.success("deleted"))
        } catch {
            printError(error.localizedDescription)
        }
    }
}
