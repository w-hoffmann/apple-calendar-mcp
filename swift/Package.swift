// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "apple-bridge",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.3.0"),
    ],
    targets: [
        .executableTarget(
            name: "apple-bridge",
            dependencies: [
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
            ],
            path: "Sources/AppleBridge",
            swiftSettings: [.unsafeFlags(["-parse-as-library"])],
            // Embed Info.plist so the TCC prompt has a usage description at
            // runtime (NSCalendarsFullAccessUsageDescription). Without this the
            // macOS 14+ access request can fail silently with no prompt text.
            linkerSettings: [.unsafeFlags([
                "-Xlinker", "-sectcreate",
                "-Xlinker", "__TEXT",
                "-Xlinker", "__info_plist",
                "-Xlinker", "Info.plist",
            ])]
        ),
    ]
)
