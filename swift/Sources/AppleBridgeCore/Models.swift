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

// Offset-aware ISO8601 parsers: a timezone designator (`Z` or `±HH:MM`) is
// mandatory, so these resolve an exact instant regardless of any local zone.
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

// Naive (no-designator) fallback formatters, keyed to a caller-supplied zone so
// a wall-clock string resolves in the server-local timezone. DST is handled
// correctly because the zone resolves the offset for the given date.
private func naiveFormatter(_ format: String, _ zone: TimeZone) -> DateFormatter {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .iso8601)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = zone
    f.dateFormat = format
    return f
}

/// Parse a date argument leniently, in priority order:
/// 1. an explicit timezone designator (`Z` or `±HH:MM`) → exact instant (zone-independent);
/// 2. a naive datetime (`YYYY-MM-DDTHH:MM:SS[.SSS]`, or `…THH:MM` without seconds) → that
///    wall-clock time in `zone`;
/// 3. a date-only value (`YYYY-MM-DD`) → local midnight in `zone`.
/// Input whose shape matches none of these throws `BridgeError.invalidDate` —
/// including a well-formed but out-of-range value like `2026-02-30` or a
/// non-zero-padded component like `2026-2-7`: each naive/date-only parse is
/// validated by reformatting and comparing to the input, so `DateFormatter`'s
/// silent day-rollover (`2026-02-30` → Mar 2) is rejected, not normalized.
///
/// `zone` defaults to `.current` (production); tests inject a fixed zone so
/// offset assertions are deterministic under a UTC CI.
public func parseISO8601(_ string: String, zone: TimeZone = .current) throws -> Date {
    // 1. Explicit offset wins — the offset-aware ISO formatters are strict, so
    //    no round-trip guard is needed here.
    if let date = isoFormatter.date(from: string) { return date }
    if let date = isoFormatterNoFraction.date(from: string) { return date }
    // 2. Naive datetime fallbacks (fractional → seconds → HH:mm), then 3.
    //    date-only. Each parse is round-trip-validated: DateFormatter silently
    //    rolls an out-of-range day over and accepts unpadded components, so a
    //    bare parse is too lax. A value that does not reproduce its own input
    //    string is not a real instant of that shape — skip it and fall through.
    for format in [
        "yyyy-MM-dd'T'HH:mm:ss.SSS",
        "yyyy-MM-dd'T'HH:mm:ss",
        "yyyy-MM-dd'T'HH:mm",
        "yyyy-MM-dd",
    ] {
        let formatter = naiveFormatter(format, zone)
        if let date = formatter.date(from: string), formatter.string(from: date) == string {
            return date
        }
    }
    throw BridgeError.invalidDate(string)
}

// Local-offset output formatter, keyed to a zone so it renders `±HH:MM` for a
// non-UTC zone and `Z` for UTC. Fractional seconds kept (design open-question
// default).
private func offsetFormatter(_ zone: TimeZone) -> ISO8601DateFormatter {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    f.timeZone = zone
    return f
}

// Cached formatter for the production hot path (server-local zone): output emits
// startDate/endDate (+ occurrenceDate) per event, so caching the default-zone
// formatter mirrors the pre-change singleton instead of allocating one per
// timestamp. A short-lived per-command CLI resolves `.current` once, so the
// cache is safe; `ISO8601DateFormatter` formatting is thread-safe regardless.
private let localOffsetFormatter: ISO8601DateFormatter = offsetFormatter(.current)

/// Format an instant with the server-local UTC offset (e.g.
/// `2026-06-13T10:00:00.000+02:00`); a UTC `zone` renders `Z`. The instant is
/// unchanged by the representation, so the `occurrenceDate` round-trip into
/// `update_event` is preserved (`SlotMatcher` compares instants, not strings).
///
/// `zone` defaults to `.current` (production, served by the cached formatter);
/// tests inject a fixed zone, which builds a throwaway formatter.
public func formatISO8601(_ date: Date, zone: TimeZone = .current) -> String {
    if zone == .current { return localOffsetFormatter.string(from: date) }
    return offsetFormatter(zone).string(from: date)
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
