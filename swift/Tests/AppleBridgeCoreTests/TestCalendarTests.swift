import Foundation
import Testing

@testable import AppleBridgeCore

@Suite("Test-calendar marker prefix guard")
struct TestCalendarNameTests {
    @Test("accepts a marker name with a run identifier")
    func acceptsMarker() {
        #expect(TestCalendar.isValidTestCalendarName("MCP-E2E-1234"))
        #expect(TestCalendar.isValidTestCalendarName("MCP-E2E-abc-def"))
    }

    @Test("rejects a non-marker name")
    func rejectsNonMarker() {
        #expect(!TestCalendar.isValidTestCalendarName("Work"))
        #expect(!TestCalendar.isValidTestCalendarName("Personal"))
        #expect(!TestCalendar.isValidTestCalendarName(""))
    }

    @Test("rejects the bare prefix with nothing after it")
    func rejectsBarePrefix() {
        #expect(!TestCalendar.isValidTestCalendarName("MCP-E2E-"))
    }

    @Test("is case-sensitive")
    func caseSensitive() {
        #expect(!TestCalendar.isValidTestCalendarName("mcp-e2e-1234"))
    }
}

@Suite("Writable source selection")
struct WritableSourceTests {
    @Test("prefers a Local source")
    func prefersLocal() {
        #expect(WritableSource.preferredIndex([.calDAV, .local, .exchange]) == 1)
    }

    @Test("falls back to the first CalDAV/Exchange when no Local exists")
    func fallsBackToWritable() {
        #expect(WritableSource.preferredIndex([.subscription, .calDAV]) == 1)
        #expect(WritableSource.preferredIndex([.exchange, .calDAV]) == 0)
    }

    @Test("returns nil when only read-only sources exist")
    func noneWritable() {
        #expect(WritableSource.preferredIndex([.subscription, .birthday]) == nil)
        #expect(WritableSource.preferredIndex([]) == nil)
    }
}
