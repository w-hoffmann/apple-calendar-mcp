import Foundation

// Pure input validation, independent of EventKit. CalendarService and the CLI
// delegate to these so every rule is unit-testable without calendar access.

/// The update span over a (possibly recurring) event. Maps 1:1 to `EKSpan` in
/// the executable, but stays EventKit-free here so it can be validated/tested.
public enum UpdateSpan: String {
    case this
    case future
}

public enum Validation {
    /// Title must not be empty.
    public static func validateTitle(_ title: String) throws {
        if title.isEmpty {
            throw BridgeError.invalidInput("Title must not be empty.")
        }
    }

    /// Timed events require a strictly positive duration; all-day events may
    /// legitimately span a single day (start == end).
    public static func validateRange(start: Date, end: Date, isAllDay: Bool) throws {
        let ok = isAllDay ? start <= end : start < end
        if !ok {
            throw BridgeError.invalidInput("Start date must be before end date.")
        }
    }

    /// Resolve a time-zone identifier, rejecting unknown ones.
    @discardableResult
    public static func validateTimeZone(_ identifier: String) throws -> TimeZone {
        guard let zone = TimeZone(identifier: identifier) else {
            throw BridgeError.invalidTimeZone(identifier)
        }
        return zone
    }

    /// Parse the `--span` value, rejecting anything but "this"/"future".
    public static func parseSpan(_ raw: String) throws -> UpdateSpan {
        guard let span = UpdateSpan(rawValue: raw) else {
            throw BridgeError.invalidInput(
                "Invalid span: \(raw). Must be 'this' or 'future'."
            )
        }
        return span
    }
}
