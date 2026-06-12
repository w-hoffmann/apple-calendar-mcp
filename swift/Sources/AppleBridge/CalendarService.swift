import AppleBridgeCore
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
        store.calendars(for: .event).map { calendarInfo(from: $0) }
    }

    // MARK: - Events

    func fetchEvents(
        start: Date,
        end: Date,
        calendarNames: [String]? = nil,
        calendarIds: [String]? = nil
    ) -> [EventInfo] {
        // Names and ids combine as a UNION: a calendar matches if its title is in
        // `calendarNames` OR its identifier is in `calendarIds`. (Earlier this was
        // names-XOR-ids — names won and ids were silently ignored when both were
        // given — which disagreed with the tool advertising both as independent
        // filters.) When neither is given, no calendar filter is applied.
        var calendars: [EKCalendar]? = nil
        let hasNames = !(calendarNames ?? []).isEmpty
        let hasIds = !(calendarIds ?? []).isEmpty
        if hasNames || hasIds {
            let nameSet = Set((calendarNames ?? []).map { $0.lowercased() })
            let idSet = Set(calendarIds ?? [])
            calendars = store.calendars(for: .event).filter {
                nameSet.contains($0.title.lowercased())
                    || idSet.contains($0.calendarIdentifier)
            }
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
        notes: String? = nil,
        recurrence: RecurrenceSpec? = nil
    ) throws -> EventInfo {
        guard let calendar = store.calendar(withIdentifier: calendarId) else {
            throw BridgeError.calendarNotFound(calendarId)
        }
        try Validation.validateTitle(title)
        try Validation.validateRange(start: startDate, end: endDate, isAllDay: isAllDay)

        let event = EKEvent(eventStore: store)
        event.calendar = calendar
        event.title = title
        event.startDate = startDate
        event.endDate = endDate
        event.isAllDay = isAllDay

        if let tz = timeZone {
            event.timeZone = try Validation.validateTimeZone(tz)
        }
        if let loc = location { event.location = loc }
        if let n = notes { event.notes = n }
        if let spec = recurrence {
            event.recurrenceRules = [recurrenceRule(from: spec)]
        }

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
            let ekEvents = store.events(matching: predicate)
            // Map the EventKit window to plain value types and delegate the
            // matching decision to the pure SlotMatcher (see SlotMatching.swift).
            let stored = ekEvents.map { storedEvent(from: $0) }
            if let idx = SlotMatcher.firstMatch(in: stored, eventId: eventId, occurrence: occ) {
                event = ekEvents[idx]
            } else {
                // No instance matched the supplied occurrenceDate. If the target series
                // is recurring, surface a descriptive, recoverable error instead of a
                // bare eventNotFound. Determine recurrence three ways: (1) the window
                // results by either id form (the EventKit-free SlotMatcher leg);
                // (2) the canonical-id lookup (store.event(withIdentifier:) does not
                // resolve external ids); and (3) an external-id lookup
                // (store.calendarItems(withExternalIdentifier:)), which keeps the
                // descriptive error reachable for an external-id caller whose
                // occurrence has moved outside the day window.
                let isRecurring =
                    SlotMatcher.windowIndicatesRecurring(stored, eventId: eventId)
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
            try Validation.validateTitle(title)
            ev.title = title
        }
        if let startDate = startDate { ev.startDate = startDate }
        if let endDate = endDate { ev.endDate = endDate }
        if let isAllDay = isAllDay { ev.isAllDay = isAllDay }
        if let location = location { ev.location = location }
        if let notes = notes { ev.notes = notes }
        if let tz = timeZone {
            ev.timeZone = try Validation.validateTimeZone(tz)
        }
        if let calId = calendarId {
            guard let cal = store.calendar(withIdentifier: calId) else {
                throw BridgeError.calendarNotFound(calId)
            }
            ev.calendar = cal
        }

        try Validation.validateRange(start: ev.startDate, end: ev.endDate, isAllDay: ev.isAllDay)

        try store.save(ev, span: span)
        return eventToInfo(ev)
    }

    // MARK: - Test Calendar (hidden E2E helper)

    /// Create an ephemeral marker calendar in a writable source. Refuses any
    /// non-marker name before touching EventKit (defense in depth — the CLI
    /// command checks too).
    func createTestCalendar(name: String) throws -> CalendarInfo {
        guard TestCalendar.isValidTestCalendarName(name) else {
            throw BridgeError.invalidInput(
                "Refusing to create a calendar whose name is not an E2E marker (\(TestCalendar.markerPrefix)...): \(name)"
            )
        }
        guard let source = writableSource() else {
            throw BridgeError.invalidInput("No writable calendar source available.")
        }
        let calendar = EKCalendar(for: .event, eventStore: store)
        calendar.title = name
        calendar.source = source
        // commit: true so the calendar is persisted and visible to a later
        // query and to teardown; commit: false would leave it only in memory.
        try store.saveCalendar(calendar, commit: true)
        return calendarInfo(from: calendar)
    }

    /// Delete every marker calendar whose title is *exactly* `name` (normally
    /// one — `createTestCalendar` makes a uniquely-named calendar per run).
    /// Idempotent: succeeds with no effect if none match. Refuses any
    /// non-marker name before touching EventKit. The marker-prefix guard plus
    /// exact-name match means this can never remove a pre-existing user
    /// calendar; to confirm removal, query `listCalendars()` separately.
    func deleteTestCalendar(name: String) throws {
        guard TestCalendar.isValidTestCalendarName(name) else {
            throw BridgeError.invalidInput(
                "Refusing to delete a calendar whose name is not an E2E marker (\(TestCalendar.markerPrefix)...): \(name)"
            )
        }
        let matches = store.calendars(for: .event).filter { $0.title == name }
        for calendar in matches {
            try store.removeCalendar(calendar, commit: true)
        }
    }

    /// The source to create a test calendar in: prefer Local, else the first
    /// CalDAV/Exchange source. Selection order is the pure WritableSource helper.
    private func writableSource() -> EKSource? {
        let sources = store.sources
        let kinds = sources.map { sourceKind(from: $0.sourceType) }
        guard let idx = WritableSource.preferredIndex(kinds) else { return nil }
        return sources[idx]
    }

    private func sourceKind(from type: EKSourceType) -> SourceKind {
        switch type {
        case .local: return .local
        case .calDAV: return .calDAV
        case .exchange: return .exchange
        case .mobileMe: return .calDAV  // legacy Apple sync source; treat as writable
        case .subscribed: return .subscription
        case .birthdays: return .birthday
        @unknown default: return .other
        }
    }

    // MARK: - Helpers

    /// Map a validated, EventKit-free `RecurrenceSpec` to an `EKRecurrenceRule`.
    private func recurrenceRule(from spec: RecurrenceSpec) -> EKRecurrenceRule {
        let frequency: EKRecurrenceFrequency
        switch spec.frequency {
        case .daily: frequency = .daily
        case .weekly: frequency = .weekly
        case .monthly: frequency = .monthly
        case .yearly: frequency = .yearly
        }

        let days: [EKRecurrenceDayOfWeek]? = spec.daysOfWeek.isEmpty
            ? nil
            : spec.daysOfWeek.map { EKRecurrenceDayOfWeek(ekWeekday(from: $0)) }

        // EventKit recurrence-end semantics (RFC 5545): occurrenceCount counts
        // the seed/first occurrence (count: 3 → seed + 2 repeats), and an end
        // date is an inclusive instant (occurrences on/before it are kept). Both
        // are surfaced verbatim to the client via the tool descriptions.
        var end: EKRecurrenceEnd? = nil
        if let count = spec.occurrenceCount {
            end = EKRecurrenceEnd(occurrenceCount: count)
        } else if let date = spec.endDate {
            end = EKRecurrenceEnd(end: date)
        }

        return EKRecurrenceRule(
            recurrenceWith: frequency,
            interval: spec.interval,
            daysOfTheWeek: days,
            daysOfTheMonth: nil,
            monthsOfTheYear: nil,
            weeksOfTheYear: nil,
            daysOfTheYear: nil,
            setPositions: nil,
            end: end
        )
    }

    private func ekWeekday(from weekday: Weekday) -> EKWeekday {
        switch weekday {
        case .SU: return .sunday
        case .MO: return .monday
        case .TU: return .tuesday
        case .WE: return .wednesday
        case .TH: return .thursday
        case .FR: return .friday
        case .SA: return .saturday
        }
    }

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

    /// EKEvent → StoredEvent shim (the thin, untested mapping the design calls
    /// for; the matching decision itself lives in the pure SlotMatcher).
    private func storedEvent(from event: EKEvent) -> StoredEvent {
        StoredEvent(
            eventId: event.eventIdentifier,
            externalId: event.calendarItemExternalIdentifier,
            occurrenceDate: event.occurrenceDate,
            hasRecurrenceRules: event.hasRecurrenceRules
        )
    }

    private func calendarInfo(from cal: EKCalendar) -> CalendarInfo {
        CalendarInfo(
            id: cal.calendarIdentifier,
            title: cal.title,
            type: calendarTypeString(cal.type),
            source: cal.source?.title ?? "Unknown",
            color: hexColor(cal.cgColor),
            isImmutable: cal.isImmutable
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
