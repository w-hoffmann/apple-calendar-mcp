import Foundation
import Testing

@testable import AppleBridgeCore

@Suite("Validation rules")
struct ValidationTests {
    // A fixed pair of instants 1h apart, EventKit-free.
    private let early = Date(timeIntervalSince1970: 1_770_458_400) // 2026-02-07T10:00:00Z
    private let late = Date(timeIntervalSince1970: 1_770_462_000)  // 2026-02-07T11:00:00Z

    @Test("empty title is rejected")
    func emptyTitle() {
        let error = bridgeError { try Validation.validateTitle("") }
        guard case .invalidInput = error else {
            Issue.record("expected .invalidInput, got \(String(describing: error))")
            return
        }
    }

    @Test("non-empty title is accepted")
    func nonEmptyTitle() {
        #expect(bridgeError { try Validation.validateTitle("Standup") } == nil)
    }

    @Test("timed event requires start < end")
    func timedRange() {
        #expect(bridgeError { try Validation.validateRange(start: early, end: late, isAllDay: false) } == nil)
        // start == end is invalid for a timed event.
        let equal = bridgeError { try Validation.validateRange(start: early, end: early, isAllDay: false) }
        guard case .invalidInput = equal else {
            Issue.record("expected .invalidInput for equal timed range")
            return
        }
        // start > end is invalid.
        #expect(bridgeError { try Validation.validateRange(start: late, end: early, isAllDay: false) } != nil)
    }

    @Test("all-day event may span a single day (start == end)")
    func allDayRange() {
        #expect(bridgeError { try Validation.validateRange(start: early, end: early, isAllDay: true) } == nil)
        // Inverted is still rejected.
        #expect(bridgeError { try Validation.validateRange(start: late, end: early, isAllDay: true) } != nil)
    }

    @Test("valid time zone resolves; invalid is rejected")
    func timeZone() throws {
        let zone = try Validation.validateTimeZone("America/New_York")
        #expect(zone.identifier == "America/New_York")
        let error = bridgeError { _ = try Validation.validateTimeZone("Mars/Phobos") }
        guard case .invalidTimeZone = error else {
            Issue.record("expected .invalidTimeZone, got \(String(describing: error))")
            return
        }
    }

    @Test("span parsing accepts this/future and rejects others")
    func span() throws {
        #expect(try Validation.parseSpan("this") == .this)
        #expect(try Validation.parseSpan("future") == .future)
        let error = bridgeError { _ = try Validation.parseSpan("sideways") }
        guard case .invalidInput = error else {
            Issue.record("expected .invalidInput, got \(String(describing: error))")
            return
        }
    }
}
