// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "IRPiOSClient",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(
            name: "IRPiOSClient",
            targets: ["IRPiOSClient"]
        ),
    ],
    targets: [
        .target(
            name: "IRPiOSClient"
        ),
        .testTarget(
            name: "IRPiOSClientTests",
            dependencies: ["IRPiOSClient"]
        ),
    ]
)
