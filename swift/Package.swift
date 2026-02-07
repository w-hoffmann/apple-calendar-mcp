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
            swiftSettings: [.unsafeFlags(["-parse-as-library"])]
        ),
    ]
)
