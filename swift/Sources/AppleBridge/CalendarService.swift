import EventKit
import Foundation

final class CalendarService {
    private let store = EKEventStore()

    // MARK: - Access

    func requestAccess() throws {
        let semaphore = DispatchSemaphore(value: 0)
        var accessGranted = false
        var accessError: Error?

        if #available(macOS 14.0, *) {
            store.requestFullAccessToEvents { granted, error in
                accessGranted = granted
                accessError = error
                semaphore.signal()
            }
        } else {
            store.requestAccess(to: .event) { granted, error in
                accessGranted = granted
                accessError = error
                semaphore.signal()
            }
        }

        semaphore.wait()

        if let error = accessError {
            throw error
        }
        if !accessGranted {
            throw BridgeError.permissionDenied
        }
    }

    func accessStatus() -> String {
        if #available(macOS 14.0, *) {
            switch EKEventStore.authorizationStatus(for: .event) {
            case .fullAccess: return "fullAccess"
            case .writeOnly: return "writeOnly"
            case .authorized: return "authorized"
            case .denied: return "denied"
            case .restricted: return "restricted"
            case .notDetermined: return "notDetermined"
            @unknown default: return "unknown"
            }
        } else {
            switch EKEventStore.authorizationStatus(for: .event) {
            case .fullAccess: return "fullAccess"
            case .writeOnly: return "writeOnly"
            case .authorized: return "authorized"
            case .denied: return "denied"
            case .restricted: return "restricted"
            case .notDetermined: return "notDetermined"
            @unknown default: return "unknown"
            }
        }
    }

    // MARK: - Diagnostics

    func diagnostics() -> DiagnosticsInfo {
        let status = accessStatus()
        let calendars = store.calendars(for: .event)
        let sources = store.sources.map { $0.title }
        let version = ProcessInfo.processInfo.operatingSystemVersionString
        return DiagnosticsInfo(
            calendarAccess: status,
            calendarCount: calendars.count,
            sources: sources,
            macOSVersion: version
        )
    }

    // MARK: - Calendars

    func listCalendars() -> [CalendarInfo] {
        store.calendars(for: .event).map { cal in
            CalendarInfo(
                id: cal.calendarIdentifier,
                title: cal.title,
                type: calendarTypeString(cal.type),
                source: cal.source?.title ?? "Unknown",
                color: hexColor(cal.cgColor),
                isImmutable: cal.isImmutable
            )
        }
    }

    // MARK: - Events

    func fetchEvents(
        start: Date,
        end: Date,
        calendarNames: [String]? = nil,
        calendarIds: [String]? = nil
    ) -> [EventInfo] {
        var calendars: [EKCalendar]? = nil

        if let names = calendarNames, !names.isEmpty {
            let allCalendars = store.calendars(for: .event)
            let nameSet = Set(names.map { $0.lowercased() })
            calendars = allCalendars.filter { nameSet.contains($0.title.lowercased()) }
        } else if let ids = calendarIds, !ids.isEmpty {
            let allCalendars = store.calendars(for: .event)
            let idSet = Set(ids)
            calendars = allCalendars.filter { idSet.contains($0.calendarIdentifier) }
        }

        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
        let events = store.events(matching: predicate)

        return events.map { eventToInfo($0) }
    }

    func todayEvents() -> [EventInfo] {
        let cal = Calendar.current
        let start = cal.startOfDay(for: Date())
        let end = cal.date(byAdding: .day, value: 1, to: start)!
        return fetchEvents(start: start, end: end)
    }

    // MARK: - Create Event

    func createEvent(
        calendarId: String,
        title: String,
        startDate: Date,
        endDate: Date,
        timeZone: String? = nil,
        isAllDay: Bool = false,
        location: String? = nil,
        notes: String? = nil
    ) throws -> EventInfo {
        guard let calendar = store.calendar(withIdentifier: calendarId) else {
            throw BridgeError.calendarNotFound(calendarId)
        }

        let event = EKEvent(eventStore: store)
        event.calendar = calendar
        event.title = title
        event.startDate = startDate
        event.endDate = endDate
        event.isAllDay = isAllDay

        if let tz = timeZone, let zone = TimeZone(identifier: tz) {
            event.timeZone = zone
        }
        if let loc = location { event.location = loc }
        if let n = notes { event.notes = n }

        try store.save(event, span: .thisEvent)
        return eventToInfo(event)
    }

    // MARK: - Delete Event

    func deleteEvent(
        eventId: String,
        span: EKSpan,
        occurrenceDate: Date? = nil
    ) throws {
        let event: EKEvent?

        if let occ = occurrenceDate {
            // For recurring events, find the specific occurrence
            let start = occ
            let end = Calendar.current.date(byAdding: .day, value: 1, to: occ)!
            let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
            let events = store.events(matching: predicate)
            event = events.first { $0.eventIdentifier == eventId || $0.calendarItemExternalIdentifier == eventId }
        } else {
            event = store.event(withIdentifier: eventId)
        }

        guard let ev = event else {
            throw BridgeError.eventNotFound(eventId)
        }

        try store.remove(ev, span: span)
    }

    // MARK: - Helpers

    private func eventToInfo(_ event: EKEvent) -> EventInfo {
        EventInfo(
            id: event.eventIdentifier,
            externalId: event.calendarItemExternalIdentifier,
            calendarId: event.calendar.calendarIdentifier,
            calendarTitle: event.calendar.title,
            title: event.title ?? "(No title)",
            startDate: formatISO8601(event.startDate),
            endDate: formatISO8601(event.endDate),
            timeZone: event.timeZone?.identifier,
            isAllDay: event.isAllDay,
            hasRecurrenceRules: event.hasRecurrenceRules,
            occurrenceDate: formatISO8601(event.occurrenceDate),
            isDetached: event.isDetached,
            location: event.location,
            notes: event.notes
        )
    }

    private func calendarTypeString(_ type: EKCalendarType) -> String {
        switch type {
        case .local: return "local"
        case .calDAV: return "calDAV"
        case .exchange: return "exchange"
        case .subscription: return "subscription"
        case .birthday: return "birthday"
        @unknown default: return "unknown"
        }
    }

    private func hexColor(_ cgColor: CGColor?) -> String {
        guard let color = cgColor,
              let components = color.components,
              components.count >= 3 else {
            return "#000000"
        }
        let r = Int(components[0] * 255)
        let g = Int(components[1] * 255)
        let b = Int(components[2] * 255)
        return String(format: "#%02X%02X%02X", r, g, b)
    }
}
