import Foundation

// Pure guards for the hidden `test-calendar` E2E subcommands. Keeping the
// marker-prefix check here (not just in test code) means the binary itself
// refuses to create or delete any calendar whose name is not clearly an
// ephemeral E2E calendar.

public enum TestCalendar {
    /// Every E2E calendar name must start with this. The bridge hard-refuses
    /// anything else, so the suite can never touch a pre-existing calendar.
    public static let markerPrefix = "MCP-E2E-"

    public static func isValidTestCalendarName(_ name: String) -> Bool {
        name.hasPrefix(markerPrefix) && name.count > markerPrefix.count
    }
}

// MARK: - Writable source selection

/// EventKit source kinds, mirrored as a plain value type so the selection
/// preference order can be unit-tested without an `EKEventStore`.
public enum SourceKind: Equatable {
    case local
    case calDAV
    case exchange
    case subscription
    case birthday
    case other
}

public enum WritableSource {
    /// Index of the source to create the test calendar in: prefer a Local
    /// source, else the first CalDAV/Exchange (e.g. iCloud) source. Read-only
    /// kinds (subscription, birthday) are never selected. Returns nil when no
    /// writable source exists.
    public static func preferredIndex(_ kinds: [SourceKind]) -> Int? {
        if let local = kinds.firstIndex(of: .local) { return local }
        return kinds.firstIndex { $0 == .calDAV || $0 == .exchange }
    }
}
