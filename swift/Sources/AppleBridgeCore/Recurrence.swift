import Foundation

// Pure recurrence input validation, independent of EventKit. The CLI parses raw
// flags and delegates here; CalendarService maps the validated RecurrenceSpec to
// an EKRecurrenceRule. Keeping the rules here makes them unit-testable without
// calendar access and authoritative for the direct-CLI path — mirroring the
// TypeScript Zod rules, with matching wording.

public enum RecurrenceFrequency: String {
    case daily
    case weekly
    case monthly
    case yearly
}

/// Two-letter weekday codes, matching the TS `daysOfWeek` enum.
public enum Weekday: String {
    case MO
    case TU
    case WE
    case TH
    case FR
    case SA
    case SU
}

/// A validated recurrence rule. `endDate` and `occurrenceCount` are mutually
/// exclusive; `daysOfWeek` is non-empty only for weekly recurrence.
public struct RecurrenceSpec {
    public let frequency: RecurrenceFrequency
    public let interval: Int
    public let endDate: Date?
    public let occurrenceCount: Int?
    public let daysOfWeek: [Weekday]

    public init(
        frequency: RecurrenceFrequency,
        interval: Int,
        endDate: Date?,
        occurrenceCount: Int?,
        daysOfWeek: [Weekday]
    ) {
        self.frequency = frequency
        self.interval = interval
        self.endDate = endDate
        self.occurrenceCount = occurrenceCount
        self.daysOfWeek = daysOfWeek
    }
}

public enum RecurrenceValidation {
    /// Validate raw CLI recurrence inputs into a `RecurrenceSpec`. `endDate` is
    /// pre-parsed by the caller (the CLI parses ISO8601 before access). Throws
    /// `BridgeError.invalidInput` for any rule violation, so the executable fails
    /// fast before requesting calendar access.
    public static func makeSpec(
        frequency: String,
        interval: Int?,
        endDate: Date?,
        occurrenceCount: Int?,
        daysOfWeek: [String]
    ) throws -> RecurrenceSpec {
        guard let freq = RecurrenceFrequency(rawValue: frequency) else {
            throw BridgeError.invalidInput(
                "Invalid recurrence frequency: \(frequency). Must be daily, weekly, monthly, or yearly."
            )
        }

        let resolvedInterval = interval ?? 1
        if resolvedInterval < 1 {
            throw BridgeError.invalidInput("Recurrence interval must be >= 1.")
        }

        if endDate != nil && occurrenceCount != nil {
            throw BridgeError.invalidInput(
                "Recurrence may specify either endDate or occurrenceCount, not both."
            )
        }
        if let count = occurrenceCount, count < 1 {
            throw BridgeError.invalidInput("Recurrence occurrenceCount must be >= 1.")
        }

        let days = try daysOfWeek.map { code -> Weekday in
            guard let day = Weekday(rawValue: code) else {
                throw BridgeError.invalidInput(
                    "Invalid weekday code: \(code). Must be one of MO, TU, WE, TH, FR, SA, SU."
                )
            }
            return day
        }
        // An EMPTY days list on a non-weekly frequency is accepted here (treated
        // as "no daysOfWeek given"), whereas the TS Zod rule rejects an explicit
        // `daysOfWeek: []` on a non-weekly frequency. The divergence is
        // unreachable via the MCP path — the TS arg builder only emits
        // `--recurrence-days` for a non-empty list, and the CLI option defaults
        // to `[]` with no way to distinguish "omitted" from "explicitly empty" —
        // and is behaviorally harmless (no weekday constraint either way).
        if !days.isEmpty && freq != .weekly {
            throw BridgeError.invalidInput("daysOfWeek applies to weekly recurrence only.")
        }

        return RecurrenceSpec(
            frequency: freq,
            interval: resolvedInterval,
            endDate: endDate,
            occurrenceCount: occurrenceCount,
            daysOfWeek: days
        )
    }
}
