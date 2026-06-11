import EventKit
import Foundation

final class CalendarService {
    private let store = EKEventStore()

    // MARK: - Access

    func requestAccess() async throws {
        let granted: Bool
        if #available(macOS 14.0, *) {
            granted = try await store.requestFullAccessToEvents()
        } else {
            granted = try await store.requestAccess(to: .event)
        }
        if !granted {
            throw BridgeError.permissionDenied
        }
    }

    func accessStatus() -> String {
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
        if title.isEmpty {
            throw BridgeError.invalidInput("Title must not be empty.")
        }
        // All-day events may legitimately span a single day (start == end);
        // timed events require a strictly positive duration.
        guard isAllDay ? startDate <= endDate : startDate < endDate else {
            throw BridgeError.invalidInput("Start date must be before end date.")
        }

        let event = EKEvent(eventStore: store)
        event.calendar = calendar
        event.title = title
        event.startDate = startDate
        event.endDate = endDate
        event.isAllDay = isAllDay

        if let tz = timeZone {
            guard let zone = TimeZone(identifier: tz) else {
                throw BridgeError.invalidTimeZone(tz)
            }
            event.timeZone = zone
        }
        if let loc = location { event.location = loc }
        if let n = notes { event.notes = n }

        try store.save(event, span: .thisEvent)
        return eventToInfo(event)
    }

    // MARK: - Update Event

    func updateEvent(
        eventId: String,
        span: EKSpan,
        occurrenceDate: Date? = nil,
        title: String? = nil,
        startDate: Date? = nil,
        endDate: Date? = nil,
        timeZone: String? = nil,
        isAllDay: Bool? = nil,
        location: String? = nil,
        notes: String? = nil,
        calendarId: String? = nil
    ) throws -> EventInfo {
        // span 'future' without an occurrenceDate would resolve the series master
        // and rewrite the whole series. Guard before resolving the event so the
        // direct-CLI path (apple-bridge update-event --span future) is covered too.
        if occurrenceDate == nil && span == .futureEvents {
            throw BridgeError.spanFutureRequiresOccurrenceDate
        }

        let event: EKEvent?

        if let occ = occurrenceDate {
            let start = occ
            let end = Calendar.current.date(byAdding: .day, value: 1, to: occ)!
            let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
            let events = store.events(matching: predicate)
            // Match on EKEvent.occurrenceDate (the stable original series slot that
            // get_events emits), not startDate — a detached/moved occurrence's
            // startDate has diverged while its occurrenceDate stays pinned. The 1 ms
            // tolerance absorbs the millisecond quantization of the re-serialized
            // value while staying far below any real occurrence spacing. All-day
            // occurrences match on the same midnight instant.
            // occurrenceDate is a `null_unspecified Date!` (IUO); it is reliably
            // non-nil for store-predicate results (they always carry a startDate),
            // but we bind it defensively rather than force-unwrap.
            let matched = events.first {
                guard let od = $0.occurrenceDate else { return false }
                return abs(od.timeIntervalSince(occ)) < 0.001
                    && ($0.eventIdentifier == eventId || $0.calendarItemExternalIdentifier == eventId)
            }
            if let matched = matched {
                event = matched
            } else {
                // No instance matched the supplied occurrenceDate. If the target series
                // is recurring, surface a descriptive, recoverable error instead of a
                // bare eventNotFound. Determine recurrence three ways: (1) the window
                // results by either id form (honors callers who passed
                // calendarItemExternalIdentifier); (2) the canonical-id lookup
                // (store.event(withIdentifier:) does not resolve external ids); and
                // (3) an external-id lookup (store.calendarItems(withExternalIdentifier:)),
                // which keeps the descriptive error reachable for an external-id caller
                // whose occurrence has moved outside the day window.
                let isRecurring =
                    events.first {
                        $0.eventIdentifier == eventId || $0.calendarItemExternalIdentifier == eventId
                    }?.hasRecurrenceRules == true
                    || store.event(withIdentifier: eventId)?.hasRecurrenceRules == true
                    || store.calendarItems(withExternalIdentifier: eventId)
                        .contains { ($0 as? EKEvent)?.hasRecurrenceRules == true }
                if isRecurring {
                    throw BridgeError.occurrenceNotFound(formatISO8601(occ))
                }
                event = nil
            }
        } else {
            event = store.event(withIdentifier: eventId)
        }

        guard let ev = event else {
            throw BridgeError.eventNotFound(eventId)
        }

        // A recurring series targeted without occurrenceDate resolves to the series
        // master here; editing it would silently change the first occurrence (span
        // 'this') instead of the intended instance. Refuse and tell the caller what
        // to pass. Only reachable in the occurrenceDate == nil branch.
        if ev.hasRecurrenceRules && occurrenceDate == nil {
            throw BridgeError.recurringRequiresOccurrenceDate
        }

        if let title = title {
            guard !title.isEmpty else {
                throw BridgeError.invalidInput("Title must not be empty.")
            }
            ev.title = title
        }
        if let startDate = startDate { ev.startDate = startDate }
        if let endDate = endDate { ev.endDate = endDate }
        if let isAllDay = isAllDay { ev.isAllDay = isAllDay }
        if let location = location { ev.location = location }
        if let notes = notes { ev.notes = notes }
        if let tz = timeZone {
            guard let zone = TimeZone(identifier: tz) else {
                throw BridgeError.invalidTimeZone(tz)
            }
            ev.timeZone = zone
        }
        if let calId = calendarId {
            guard let cal = store.calendar(withIdentifier: calId) else {
                throw BridgeError.calendarNotFound(calId)
            }
            ev.calendar = cal
        }

        // All-day events may legitimately span a single day (start == end);
        // timed events require a strictly positive duration.
        guard ev.isAllDay ? ev.startDate <= ev.endDate : ev.startDate < ev.endDate else {
            throw BridgeError.invalidInput("Start date must be before end date.")
        }

        try store.save(ev, span: span)
        return eventToInfo(ev)
    }

    // MARK: - Helpers

    private func eventToInfo(_ event: EKEvent) -> EventInfo {
        EventInfo(
            id: event.eventIdentifier ?? "",
            externalId: event.calendarItemExternalIdentifier,
            calendarId: event.calendar?.calendarIdentifier ?? "",
            calendarTitle: event.calendar?.title ?? "",
            title: event.title ?? "(No title)",
            startDate: formatISO8601(event.startDate),
            endDate: formatISO8601(event.endDate),
            timeZone: event.timeZone?.identifier,
            isAllDay: event.isAllDay,
            hasRecurrenceRules: event.hasRecurrenceRules,
            // occurrenceDate is a `null_unspecified Date!` (IUO); map over it instead
            // of force-unwrapping so a nil slot serializes as null rather than trapping.
            occurrenceDate: event.occurrenceDate.map(formatISO8601),
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
