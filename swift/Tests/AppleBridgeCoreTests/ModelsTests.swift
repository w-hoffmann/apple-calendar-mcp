import Foundation
import Testing

@testable import AppleBridgeCore

// Capture a thrown BridgeError (or nil) so tests can assert the specific case
// and message without depending on a particular Swift Testing throws-API shape.
func bridgeError(_ body: () throws -> Void) -> BridgeError? {
    do {
        try body()
        return nil
    } catch let error as BridgeError {
        return error
    } catch {
        return nil
    }
}

@Suite("Models: ISO8601")
struct ISO8601Tests {
    @Test("parses the no-fractional-seconds format")
    func parsesPlain() throws {
        let date = try parseISO8601("2026-02-07T10:00:00Z")
        // 2026-02-07T10:00:00Z
        #expect(date == Date(timeIntervalSince1970: 1_770_458_400))
    }

    @Test("parses the fractional-seconds format to the same instant")
    func parsesFractional() throws {
        let plain = try parseISO8601("2026-02-07T10:00:00Z")
        let fractional = try parseISO8601("2026-02-07T10:00:00.000Z")
        #expect(plain == fractional)
    }

    @Test("round-trips format → parse")
    func roundTrips() throws {
        let original = Date(timeIntervalSince1970: 1_770_458_400)
        let string = formatISO8601(original)
        let parsed = try parseISO8601(string)
        #expect(parsed == original)
    }

    @Test("rejects an unparseable string")
    func rejectsGarbage() {
        let error = bridgeError { _ = try parseISO8601("not-a-date") }
        guard case .invalidDate = error else {
            Issue.record("expected .invalidDate, got \(String(describing: error))")
            return
        }
    }
}

@Suite("Models: BridgeOutput envelope")
struct BridgeOutputTests {
    private func encode<T: Encodable>(_ output: BridgeOutput<T>) throws -> [String: Any] {
        let encoder = JSONEncoder()
        let data = try encoder.encode(output)
        return try #require(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )
    }

    // A field is "empty" when the key is absent or present as null — Swift's
    // JSONEncoder omits nil optionals, which the TS side reads as undefined.
    private func isEmpty(_ value: Any?) -> Bool {
        value == nil || value is NSNull
    }

    @Test("success envelope matches the contract")
    func successContract() throws {
        let json = try encode(BridgeOutput.success("payload"))
        #expect(json["status"] as? String == "ok")
        #expect(json["data"] as? String == "payload")
        #expect(isEmpty(json["error"]))
    }

    @Test("failure envelope matches the contract")
    func failureContract() throws {
        let json = try encode(BridgeOutput<String>.failure("boom"))
        #expect(json["status"] as? String == "error")
        #expect(json["error"] as? String == "boom")
        #expect(isEmpty(json["data"]))
    }
}

@Suite("Models: BridgeError messages")
struct BridgeErrorTests {
    @Test("descriptions carry actionable text")
    func messages() {
        #expect(BridgeError.permissionDenied.description.contains("Calendar access denied"))
        #expect(BridgeError.calendarNotFound("X").description.contains("X"))
        #expect(BridgeError.invalidTimeZone("Mars/Phobos").description.contains("Mars/Phobos"))
        #expect(BridgeError.invalidInput("custom").description == "custom")
        // errorDescription (LocalizedError) mirrors description.
        #expect(BridgeError.eventNotFound("E").errorDescription == BridgeError.eventNotFound("E").description)
    }

    @Test("recurring/occurrence guidance messages mention occurrenceDate")
    func recurringMessages() {
        #expect(BridgeError.recurringRequiresOccurrenceDate.description.contains("occurrenceDate"))
        #expect(BridgeError.spanFutureRequiresOccurrenceDate.description.contains("occurrenceDate"))
        // occurrenceNotFound echoes the supplied value back to the caller.
        #expect(BridgeError.occurrenceNotFound("2026-02-07T10:00:00Z").description.contains("2026-02-07T10:00:00Z"))
    }
}
