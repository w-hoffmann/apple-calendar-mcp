import Foundation

// MARK: - Bridge Output Envelope

struct BridgeOutput<T: Encodable>: Encodable {
    let status: String
    let data: T?
    let error: String?

    static func success(_ data: T) -> BridgeOutput {
        BridgeOutput(status: "ok", data: data, error: nil)
    }

    static func failure(_ message: String) -> BridgeOutput<String> {
        BridgeOutput<String>(status: "error", data: nil, error: message)
    }
}

// MARK: - Calendar Info

struct CalendarInfo: Encodable {
    let id: String
    let title: String
    let type: String
    let source: String
    let color: String
    let isImmutable: Bool
}

// MARK: - Event Info

struct EventInfo: Encodable {
    let id: String
    let externalId: String?
    let calendarId: String
    let calendarTitle: String
    let title: String
    let startDate: String
    let endDate: String
    let timeZone: String?
    let isAllDay: Bool
    let hasRecurrenceRules: Bool
    let occurrenceDate: String?
    let isDetached: Bool
    let location: String?
    let notes: String?
}

// MARK: - Diagnostics Info

struct DiagnosticsInfo: Encodable {
    let calendarAccess: String
    let calendarCount: Int
    let sources: [String]
    let macOSVersion: String
}

// MARK: - Bridge Error

enum BridgeError: Error, LocalizedError, CustomStringConvertible {
    case permissionDenied
    case calendarNotFound(String)
    case eventNotFound(String)
    case invalidDate(String)
    case invalidTimeZone(String)
    case invalidInput(String)
    case recurringRequiresOccurrenceDate
    case spanFutureRequiresOccurrenceDate
    case occurrenceNotFound(String)

    var errorDescription: String? { description }

    var description: String {
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

func parseISO8601(_ string: String) throws -> Date {
    if let date = isoFormatter.date(from: string) { return date }
    if let date = isoFormatterNoFraction.date(from: string) { return date }
    throw BridgeError.invalidDate(string)
}

func formatISO8601(_ date: Date) -> String {
    isoFormatter.string(from: date)
}

func printJSON<T: Encodable>(_ output: BridgeOutput<T>) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    if let data = try? encoder.encode(output),
       let json = String(data: data, encoding: .utf8) {
        print(json)
    }
}

func printError(_ message: String) {
    printJSON(BridgeOutput<String>.failure(message))
}
