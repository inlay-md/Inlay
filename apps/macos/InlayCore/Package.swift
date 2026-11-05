// swift-tools-version: 6.0
// SPDX-License-Identifier: Apache-2.0
import PackageDescription

let package = Package(
    name: "InlayCore",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "InlayCore", targets: ["InlayCore"]),
    ],
    targets: [
        .target(
            name: "InlayCore",
            resources: [.copy("Resources/md-render.jsc.js")],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "InlayCoreTests",
            dependencies: ["InlayCore"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
