import Foundation

// Recurring-event slot matching, extracted as a pure function over a plain
// value struct so it needs no EventKit objects. CalendarService maps each
// `EKEvent` in the occurrence window to a `StoredEvent` (a thin, untested
// shim) and then delegates the matching decision here.

/// The four `EKEvent` fields the matching decision reads — nothing else.
public struct StoredEvent: Equatable {
    public let eventId: String?
    public let externalId: String?
    public let occurrenceDate: Date?
    public let hasRecurrenceRules: Bool

    public init(
        eventId: String?,
        externalId: String?,
        occurrenceDate: Date?,
        hasRecurrenceRules: Bool
    ) {
        self.eventId = eventId
        self.externalId = externalId
        self.occurrenceDate = occurrenceDate
        self.hasRecurrenceRules = hasRecurrenceRules
    }
}

public enum SlotMatcher {
    /// Tolerance (seconds) absorbing the millisecond quantization of the
    /// re-serialized occurrenceDate value, while staying far below any real
    /// occurrence spacing.
    public static let tolerance: TimeInterval = 0.001

    /// Does this stored event represent the requested occurrence slot?
    ///
    /// Match on `occurrenceDate` (the stable original series slot that
    /// get_events emits), not startDate — a detached/moved occurrence's
    /// startDate has diverged while its occurrenceDate stays pinned. The
    /// id may arrive as either the canonical `eventId` or the
    /// `externalId` (callers pass whichever get_events returned).
    public static func matches(
        _ event: StoredEvent,
        eventId: String,
        occurrence: Date
    ) -> Bool {
        guard let od = event.occurrenceDate else { return false }
        return abs(od.timeIntervalSince(occurrence)) < tolerance
            && (event.eventId == eventId || event.externalId == eventId)
    }

    /// Index of the first window event matching the requested slot, or nil.
    public static func firstMatch(
        in events: [StoredEvent],
        eventId: String,
        occurrence: Date
    ) -> Int? {
        events.firstIndex { matches($0, eventId: eventId, occurrence: occurrence) }
    }

    /// Whether any window event carrying the target id (in either id form) is
    /// recurring — the cheap, EventKit-free leg of the is-recurring decision
    /// used to choose between a descriptive `occurrenceNotFound` and a bare
    /// `eventNotFound` when no slot matched.
    public static func windowIndicatesRecurring(
        _ events: [StoredEvent],
        eventId: String
    ) -> Bool {
        events.first {
            $0.eventId == eventId || $0.externalId == eventId
        }?.hasRecurrenceRules == true
    }
}
