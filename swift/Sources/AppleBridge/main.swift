import ArgumentParser
import EventKit
import Foundation

@main
struct AppleBridge: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "apple-bridge",
        abstract: "EventKit bridge for MCP server",
        subcommands: [
            Doctor.self,
            Calendars.self,
            Events.self,
            Today.self,
            CreateEvent.self,
            DeleteEvent.self,
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

struct Calendars: ParsableCommand {
    static let configuration = CommandConfiguration(abstract: "List calendars")

    func run() {
        let service = CalendarService()
        do {
            try service.requestAccess()
            let calendars = service.listCalendars()
            printJSON(BridgeOutput.success(calendars))
        } catch {
            printError(error.localizedDescription)
        }
    }
}

// MARK: - Events

struct Events: ParsableCommand {
    static let configuration = CommandConfiguration(abstract: "List events in date range")

    @Option(help: "Start date (ISO8601)")
    var start: String

    @Option(help: "End date (ISO8601)")
    var end: String

    @Option(name: .long, parsing: .upToNextOption, help: "Filter by calendar names")
    var calendars: [String] = []

    @Option(name: .customLong("calendar-ids"), parsing: .upToNextOption, help: "Filter by calendar IDs")
    var calendarIds: [String] = []

    func run() {
        let service = CalendarService()
        do {
            let startDate = try parseISO8601(start)
            let endDate = try parseISO8601(end)
            try service.requestAccess()
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

struct Today: ParsableCommand {
    static let configuration = CommandConfiguration(abstract: "List today's events")

    func run() {
        let service = CalendarService()
        do {
            try service.requestAccess()
            let events = service.todayEvents()
            printJSON(BridgeOutput.success(events))
        } catch {
            printError(error.localizedDescription)
        }
    }
}

// MARK: - Create Event

struct CreateEvent: ParsableCommand {
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

    func run() {
        let service = CalendarService()
        do {
            let startDate = try parseISO8601(start)
            let endDate = try parseISO8601(end)
            try service.requestAccess()
            let event = try service.createEvent(
                calendarId: calendarId,
                title: title,
                startDate: startDate,
                endDate: endDate,
                timeZone: timeZone,
                isAllDay: allDay,
                location: location,
                notes: notes
            )
            printJSON(BridgeOutput.success(event))
        } catch {
            printError(error.localizedDescription)
        }
    }
}

// MARK: - Delete Event

struct DeleteEvent: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "delete-event",
        abstract: "Delete an event"
    )

    @Option(help: "Event ID")
    var id: String

    @Option(help: "Span: this or all")
    var span: String = "this"

    @Option(help: "Occurrence date for recurring events (ISO8601)")
    var occurrence: String?

    func run() {
        let service = CalendarService()
        do {
            try service.requestAccess()
            let ekSpan: EKSpan = span == "all" ? .futureEvents : .thisEvent
            let occDate = try occurrence.map { try parseISO8601($0) }
            try service.deleteEvent(eventId: id, span: ekSpan, occurrenceDate: occDate)
            printJSON(BridgeOutput.success("Event deleted"))
        } catch {
            printError(error.localizedDescription)
        }
    }
}
