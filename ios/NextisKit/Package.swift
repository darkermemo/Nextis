// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NextisKit",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "NextisKit", targets: ["NextisKit"]) 
    ],
    targets: [
        .target(name: "NextisKit")
    ]
)
