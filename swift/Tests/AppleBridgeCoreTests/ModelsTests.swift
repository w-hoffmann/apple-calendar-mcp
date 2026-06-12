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
    // Berlin is +01:00 in winter (CET) and +02:00 in summer (CEST). Injecting it
    // makes the offset assertions deterministic under a UTC CI (where
    // TimeZone.current would itself be `Z`).
    let berlin = TimeZone(identifier: "Europe/Berlin")!
    let utc = TimeZone(identifier: "UTC")!

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

    // 3.1 — explicit offset designators resolve to the exact instant regardless
    // of the injected zone (the designator wins).
    @Test("explicit Z and ±HH:MM offsets resolve to the exact instant, zone-independent")
    func explicitOffsetWins() throws {
        let z = try parseISO8601("2026-02-07T10:00:00Z", zone: berlin)
        #expect(z == Date(timeIntervalSince1970: 1_770_458_400))
        // +02:00 means local 12:00 is the same 10:00Z instant. The injected
        // Berlin zone must NOT shift it further.
        let offset = try parseISO8601("2026-02-07T12:00:00+02:00", zone: berlin)
        #expect(offset == Date(timeIntervalSince1970: 1_770_458_400))
        // Injecting UTC for the same offset-bearing string yields the same instant.
        let viaUTC = try parseISO8601("2026-02-07T12:00:00+02:00", zone: utc)
        #expect(viaUTC == offset)
    }

    // 3.2 — naive datetime (with/without fractional seconds and the HH:mm form)
    // resolves in the injected zone; date-only resolves to local midnight there.
    @Test("naive datetime and date-only resolve in the injected zone")
    func naiveResolvesInZone() throws {
        // Berlin is CET (+01:00) on Feb 7, so naive 11:00 local == 10:00Z.
        let expected = Date(timeIntervalSince1970: 1_770_458_400) // 2026-02-07T10:00:00Z
        let seconds = try parseISO8601("2026-02-07T11:00:00", zone: berlin)
        #expect(seconds == expected)
        let fractional = try parseISO8601("2026-02-07T11:00:00.000", zone: berlin)
        #expect(fractional == expected)
        let minute = try parseISO8601("2026-02-07T11:00", zone: berlin)
        #expect(minute == expected)
        // Date-only → local midnight in Berlin: 2026-02-07T00:00 CET == 2026-02-06T23:00Z.
        let dateOnly = try parseISO8601("2026-02-07", zone: berlin)
        #expect(dateOnly == Date(timeIntervalSince1970: 1_770_418_800))
    }

    // 3.3 — genuinely invalid input still throws .invalidDate.
    @Test("rejects an unparseable string")
    func rejectsGarbage() {
        let error = bridgeError { _ = try parseISO8601("not-a-date") }
        guard case .invalidDate = error else {
            Issue.record("expected .invalidDate, got \(String(describing: error))")
            return
        }
    }

    // Out-of-range and non-canonical inputs must throw, not silently roll over.
    // DateFormatter would parse "2026-02-30T11:00:00" to Mar 2 and accept unpadded
    // components; the round-trip guard in parseISO8601 rejects both.
    @Test("rejects an out-of-range or non-canonical date instead of rolling it over")
    func rejectsRollover() {
        for bad in [
            "2026-02-30T11:00:00",  // Feb 30 → would roll to Mar 2
            "2026-04-31",           // Apr 31 → would roll to May 1
            "2026-13-01",           // month 13
            "2026-2-7T11:00:00",    // unpadded month/day
        ] {
            let error = bridgeError { _ = try parseISO8601(bad, zone: berlin) }
            guard case .invalidDate = error else {
                Issue.record("expected .invalidDate for \(bad), got \(String(describing: error))")
                return
            }
        }
        // Sanity: a valid in-range minute-form date still parses (no over-rejection).
        #expect((try? parseISO8601("2026-02-07T11:00", zone: berlin)) != nil)
    }

    // 3.4 — format carries the local offset for a non-UTC zone (summer +02:00,
    // winter +01:00) and renders `Z` for UTC.
    @Test("format carries the injected zone's offset; UTC renders Z")
    func formatCarriesOffset() {
        let summer = Date(timeIntervalSince1970: 1_751_360_400) // 2025-07-01T09:00:00Z
        #expect(formatISO8601(summer, zone: berlin).hasSuffix("+02:00"))
        let winter = Date(timeIntervalSince1970: 1_770_458_400) // 2026-02-07T10:00:00Z
        #expect(formatISO8601(winter, zone: berlin).hasSuffix("+01:00"))
        let utcString = formatISO8601(summer, zone: utc)
        #expect(utcString.hasSuffix("Z"))
        #expect(!utcString.contains("+"))
    }

    // 3.5 — an all-day event's local-midnight Date formats with the local offset,
    // guarding against an accidental UTC `…T22:00:00Z` regression.
    @Test("all-day local-midnight formats with the local offset, not a shifted UTC Z")
    func allDayLocalMidnightFormat() throws {
        // Local midnight on a summer day in Berlin.
        let localMidnight = try parseISO8601("2026-07-01", zone: berlin)
        let formatted = formatISO8601(localMidnight, zone: berlin)
        #expect(formatted.hasPrefix("2026-07-01T00:00:00"))
        #expect(formatted.hasSuffix("+02:00"))
    }

    // Cross-language mirror: the SAME instant and the SAME literal are asserted by
    // the TS `formatLocalISO` test (test/free-slots.test.ts). Pinning both
    // "local-offset ISO" implementations to a byte-identical string here guards
    // against the two formatters silently diverging (e.g. on fractional seconds or
    // the offset shape) — slot output and event output must look identical.
    @Test("output matches the TS formatLocalISO shape byte-for-byte")
    func mirrorsTSFormatter() {
        // 2026-07-01T08:00:00Z; Berlin is +02:00 in July. Mirrors the TS test's
        // Date.UTC(2026, 6, 1, 8, 0, 0) → formatLocalISO(ms, 120).
        let instant = Date(timeIntervalSince1970: 1_782_892_800)
        #expect(formatISO8601(instant, zone: berlin) == "2026-07-01T10:00:00.000+02:00")
    }

    // 3.6 — round-trip format → parse yields the original instant, for a non-UTC
    // and the default zone (guards the occurrenceDate / SlotMatcher contract).
    @Test("round-trips format → parse for an injected and the default zone")
    func roundTrips() throws {
        let original = Date(timeIntervalSince1970: 1_770_458_400)
        // Default zone (production path).
        #expect(try parseISO8601(formatISO8601(original)) == original)
        // Injected non-UTC zone: the offset travels through both directions.
        let berlinString = formatISO8601(original, zone: berlin)
        #expect(try parseISO8601(berlinString, zone: berlin) == original)
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
