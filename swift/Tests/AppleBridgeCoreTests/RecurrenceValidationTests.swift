import Foundation
import Testing

@testable import AppleBridgeCore

@Suite("Recurrence validation rules")
struct RecurrenceValidationTests {
    private let endDate = Date(timeIntervalSince1970: 1_798_761_600) // 2026-12-31

    @Test("each frequency is accepted")
    func eachFrequency() throws {
        for raw in ["daily", "weekly", "monthly", "yearly"] {
            let spec = try RecurrenceValidation.makeSpec(
                frequency: raw, interval: nil, endDate: nil,
                occurrenceCount: nil, daysOfWeek: []
            )
            #expect(spec.frequency.rawValue == raw)
        }
    }

    @Test("interval defaults to 1 when omitted")
    func defaultInterval() throws {
        let spec = try RecurrenceValidation.makeSpec(
            frequency: "weekly", interval: nil, endDate: nil,
            occurrenceCount: nil, daysOfWeek: []
        )
        #expect(spec.interval == 1)
    }

    @Test("unknown frequency is rejected")
    func unknownFrequency() {
        let error = bridgeError {
            _ = try RecurrenceValidation.makeSpec(
                frequency: "fortnightly", interval: nil, endDate: nil,
                occurrenceCount: nil, daysOfWeek: []
            )
        }
        guard case .invalidInput = error else {
            Issue.record("expected .invalidInput, got \(String(describing: error))")
            return
        }
    }

    @Test("interval < 1 is rejected")
    func nonPositiveInterval() {
        #expect(bridgeError {
            _ = try RecurrenceValidation.makeSpec(
                frequency: "weekly", interval: 0, endDate: nil,
                occurrenceCount: nil, daysOfWeek: []
            )
        } != nil)
    }

    @Test("endDate and occurrenceCount together are rejected")
    func endExclusivity() {
        let error = bridgeError {
            _ = try RecurrenceValidation.makeSpec(
                frequency: "weekly", interval: 1, endDate: endDate,
                occurrenceCount: 10, daysOfWeek: []
            )
        }
        guard case .invalidInput = error else {
            Issue.record("expected .invalidInput, got \(String(describing: error))")
            return
        }
    }

    @Test("either end alone is accepted")
    func eitherEndAlone() throws {
        let byDate = try RecurrenceValidation.makeSpec(
            frequency: "weekly", interval: 1, endDate: endDate,
            occurrenceCount: nil, daysOfWeek: []
        )
        #expect(byDate.endDate != nil)
        let byCount = try RecurrenceValidation.makeSpec(
            frequency: "weekly", interval: 1, endDate: nil,
            occurrenceCount: 5, daysOfWeek: []
        )
        #expect(byCount.occurrenceCount == 5)
    }

    @Test("occurrenceCount < 1 is rejected")
    func nonPositiveCount() {
        #expect(bridgeError {
            _ = try RecurrenceValidation.makeSpec(
                frequency: "weekly", interval: 1, endDate: nil,
                occurrenceCount: 0, daysOfWeek: []
            )
        } != nil)
    }

    @Test("daysOfWeek is accepted for weekly recurrence")
    func daysOfWeekWeekly() throws {
        let spec = try RecurrenceValidation.makeSpec(
            frequency: "weekly", interval: 1, endDate: nil,
            occurrenceCount: nil, daysOfWeek: ["MO", "WE", "FR"]
        )
        #expect(spec.daysOfWeek == [.MO, .WE, .FR])
    }

    @Test("daysOfWeek is rejected for non-weekly frequencies")
    func daysOfWeekNonWeekly() {
        for freq in ["daily", "monthly", "yearly"] {
            let error = bridgeError {
                _ = try RecurrenceValidation.makeSpec(
                    frequency: freq, interval: 1, endDate: nil,
                    occurrenceCount: nil, daysOfWeek: ["MO"]
                )
            }
            guard case .invalidInput = error else {
                Issue.record("expected .invalidInput for \(freq), got \(String(describing: error))")
                return
            }
        }
    }

    @Test("invalid weekday code is rejected")
    func invalidWeekday() {
        #expect(bridgeError {
            _ = try RecurrenceValidation.makeSpec(
                frequency: "weekly", interval: 1, endDate: nil,
                occurrenceCount: nil, daysOfWeek: ["XX"]
            )
        } != nil)
    }
}
