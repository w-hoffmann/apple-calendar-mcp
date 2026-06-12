// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "apple-bridge",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.3.0"),
    ],
    targets: [
        // EventKit-free core: models, validation, recurring slot matching, and
        // the E2E marker/source guards. Unit-tested via `swift test`.
        .target(
            name: "AppleBridgeCore",
            path: "Sources/AppleBridgeCore"
        ),
        .executableTarget(
            name: "apple-bridge",
            dependencies: [
                "AppleBridgeCore",
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
            ],
            path: "Sources/AppleBridge",
            // Embed Info.plist so the TCC prompt has a usage description at
            // runtime (NSCalendarsFullAccessUsageDescription). Without this the
            // macOS 14+ access request can fail silently with no prompt text.
            // (The `-parse-as-library` flag is no longer needed now that the
            // entry point lives in AppleBridge.swift, not a `main.swift`.)
            linkerSettings: [.unsafeFlags([
                "-Xlinker", "-sectcreate",
                "-Xlinker", "__TEXT",
                "-Xlinker", "__info_plist",
                "-Xlinker", "Info.plist",
            ])]
        ),
        .testTarget(
            name: "AppleBridgeCoreTests",
            dependencies: ["AppleBridgeCore"],
            path: "Tests/AppleBridgeCoreTests"
        ),
    ]
)
