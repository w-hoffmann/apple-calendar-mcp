import Foundation

// MARK: - Bridge Output Envelope

public struct BridgeOutput<T: Encodable>: Encodable {
    public let status: String
    public let data: T?
    public let error: String?

    public init(status: String, data: T?, error: String?) {
        self.status = status
        self.data = data
        self.error = error
    }

    public static func success(_ data: T) -> BridgeOutput {
        BridgeOutput(status: "ok", data: data, error: nil)
    }

    public static func failure(_ message: String) -> BridgeOutput<String> {
        BridgeOutput<String>(status: "error", data: nil, error: message)
    }
}

// MARK: - Calendar Info

public struct CalendarInfo: Encodable {
    public let id: String
    public let title: String
    public let type: String
    public let source: String
    public let color: String
    public let isImmutable: Bool

    public init(
        id: String,
        title: String,
        type: String,
        source: String,
        color: String,
        isImmutable: Bool
    ) {
        self.id = id
        self.title = title
        self.type = type
        self.source = source
        self.color = color
        self.isImmutable = isImmutable
    }
}

// MARK: - Event Info

public struct EventInfo: Encodable {
    public let id: String
    public let externalId: String?
    public let calendarId: String
    public let calendarTitle: String
    public let title: String
    public let startDate: String
    public let endDate: String
    public let timeZone: String?
    public let isAllDay: Bool
    public let hasRecurrenceRules: Bool
    public let occurrenceDate: String?
    public let isDetached: Bool
    public let location: String?
    public let notes: String?

    public init(
        id: String,
        externalId: String?,
        calendarId: String,
        calendarTitle: String,
        title: String,
        startDate: String,
        endDate: String,
        timeZone: String?,
        isAllDay: Bool,
        hasRecurrenceRules: Bool,
        occurrenceDate: String?,
        isDetached: Bool,
        location: String?,
        notes: String?
    ) {
        self.id = id
        self.externalId = externalId
        self.calendarId = calendarId
        self.calendarTitle = calendarTitle
        self.title = title
        self.startDate = startDate
        self.endDate = endDate
        self.timeZone = timeZone
        self.isAllDay = isAllDay
        self.hasRecurrenceRules = hasRecurrenceRules
        self.occurrenceDate = occurrenceDate
        self.isDetached = isDetached
        self.location = location
        self.notes = notes
    }
}

// MARK: - Diagnostics Info

public struct DiagnosticsInfo: Encodable {
    public let calendarAccess: String
    public let calendarCount: Int
    public let sources: [String]
    public let macOSVersion: String

    public init(
        calendarAccess: String,
        calendarCount: Int,
        sources: [String],
        macOSVersion: String
    ) {
        self.calendarAccess = calendarAccess
        self.calendarCount = calendarCount
        self.sources = sources
        self.macOSVersion = macOSVersion
    }
}

// MARK: - Bridge Error

public enum BridgeError: Error, LocalizedError, CustomStringConvertible {
    case permissionDenied
    case calendarNotFound(String)
    case eventNotFound(String)
    case invalidDate(String)
    case invalidTimeZone(String)
    case invalidInput(String)
    case recurringRequiresOccurrenceDate
    case spanFutureRequiresOccurrenceDate
    case occurrenceNotFound(String)

    public var errorDescription: String? { description }

    public var description: String {
        switch self {
        case .permissionDenied:
            return "Calendar access denied. Grant access in System Settings > Privacy & Security > Calendars."
        case .calendarNotFound(let name):
            return "Calendar not found: \(name)"
        case .eventNotFound(let id):
            return "Event not found: \(id)"
        case .invalidDate(let value):
            return "Invalid ISO8601 date: \(value)"
        case .invalidTimeZone(let id):
            return "Invalid time zone: \(id)"
        case .invalidInput(let message):
            return message
        case .recurringRequiresOccurrenceDate:
            return "This is a recurring event. Pass occurrenceDate set to the target instance's occurrenceDate value from get_events to choose which occurrence to update, instead of editing the whole series."
        case .spanFutureRequiresOccurrenceDate:
            return "span 'future' requires occurrenceDate. Pass occurrenceDate set to the starting instance's occurrenceDate value from get_events so the change applies from that occurrence forward."
        case .occurrenceNotFound(let value):
            return "No occurrence of this recurring event matches occurrenceDate \(value). Pass the exact value returned by get_events.occurrenceDate for the instance you want to update."
        }
    }
}

// MARK: - JSON Helpers

let isoFormatter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()

let isoFormatterNoFraction: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()

public func parseISO8601(_ string: String) throws -> Date {
    if let date = isoFormatter.date(from: string) { return date }
    if let date = isoFormatterNoFraction.date(from: string) { return date }
    throw BridgeError.invalidDate(string)
}

public func formatISO8601(_ date: Date) -> String {
    isoFormatter.string(from: date)
}

public func printJSON<T: Encodable>(_ output: BridgeOutput<T>) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    if let data = try? encoder.encode(output),
       let json = String(data: data, encoding: .utf8) {
        print(json)
    }
}

public func printError(_ message: String) {
    printJSON(BridgeOutput<String>.failure(message))
}
