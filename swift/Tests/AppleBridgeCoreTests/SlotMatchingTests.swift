import Foundation
import Testing

@testable import AppleBridgeCore

// Characterization tests locking the pre-refactor recurring slot-matching
// behavior: match on occurrenceDate within a 1 ms tolerance, by either id form.
@Suite("Recurring slot matching")
struct SlotMatchingTests {
    private let occ = Date(timeIntervalSince1970: 1_770_458_400) // requested slot

    private func event(
        eventId: String? = nil,
        externalId: String? = nil,
        occurrenceDate: Date?,
        recurring: Bool = true
    ) -> StoredEvent {
        StoredEvent(
            eventId: eventId,
            externalId: externalId,
            occurrenceDate: occurrenceDate,
            hasRecurrenceRules: recurring
        )
    }

    @Test("occurrence at the requested slot matches by canonical id")
    func matchesByEventId() {
        let e = event(eventId: "E", occurrenceDate: occ)
        #expect(SlotMatcher.matches(e, eventId: "E", occurrence: occ))
    }

    @Test("occurrence matches by external id when eventId differs")
    func matchesByExternalId() {
        let e = event(eventId: "canonical", externalId: "EXT", occurrenceDate: occ)
        #expect(SlotMatcher.matches(e, eventId: "EXT", occurrence: occ))
    }

    @Test("no match when the slot differs beyond tolerance")
    func noMatchDifferentSlot() {
        let e = event(eventId: "E", occurrenceDate: occ.addingTimeInterval(60))
        #expect(!SlotMatcher.matches(e, eventId: "E", occurrence: occ))
        #expect(SlotMatcher.firstMatch(in: [e], eventId: "E", occurrence: occ) == nil)
    }

    @Test("no match when the id differs")
    func noMatchDifferentId() {
        let e = event(eventId: "OTHER", occurrenceDate: occ)
        #expect(!SlotMatcher.matches(e, eventId: "E", occurrence: occ))
    }

    @Test("nil occurrenceDate never matches")
    func nilOccurrenceNeverMatches() {
        let e = event(eventId: "E", occurrenceDate: nil)
        #expect(!SlotMatcher.matches(e, eventId: "E", occurrence: occ))
    }

    @Test("sub-millisecond drift still matches; >1ms does not")
    func tolerance() {
        let within = event(eventId: "E", occurrenceDate: occ.addingTimeInterval(0.0005))
        #expect(SlotMatcher.matches(within, eventId: "E", occurrence: occ))
        let beyond = event(eventId: "E", occurrenceDate: occ.addingTimeInterval(0.002))
        #expect(!SlotMatcher.matches(beyond, eventId: "E", occurrence: occ))
    }

    @Test("firstMatch returns the first matching candidate among multiple")
    func multipleCandidates() {
        let nonMatch = event(eventId: "E", occurrenceDate: occ.addingTimeInterval(120))
        let first = event(eventId: "E", occurrenceDate: occ)
        let second = event(eventId: "E", occurrenceDate: occ)
        let idx = SlotMatcher.firstMatch(in: [nonMatch, first, second], eventId: "E", occurrence: occ)
        #expect(idx == 1)
    }

    @Test("all-day occurrence matches on the same midnight instant")
    func allDayEdge() {
        // All-day occurrences carry occurrenceDate at local midnight; the same
        // instant matches exactly.
        let midnight = Date(timeIntervalSince1970: 1_770_422_400) // 2026-02-07T00:00:00Z
        let e = event(eventId: "E", occurrenceDate: midnight)
        #expect(SlotMatcher.matches(e, eventId: "E", occurrence: midnight))
    }

    @Test("windowIndicatesRecurring reflects the matched id's recurrence flag")
    func windowRecurring() {
        let recurring = event(eventId: "E", occurrenceDate: occ, recurring: true)
        #expect(SlotMatcher.windowIndicatesRecurring([recurring], eventId: "E"))

        let nonRecurring = event(eventId: "E", occurrenceDate: occ, recurring: false)
        #expect(!SlotMatcher.windowIndicatesRecurring([nonRecurring], eventId: "E"))

        // No window event carries the target id → not indicated here.
        let other = event(eventId: "OTHER", occurrenceDate: occ, recurring: true)
        #expect(!SlotMatcher.windowIndicatesRecurring([other], eventId: "E"))
    }
}
