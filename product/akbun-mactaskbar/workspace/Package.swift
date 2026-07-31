// swift-tools-version: 6.0
import PackageDescription

// Two targets so the parts worth testing carry no AppKit. MacTaskbarCore is the
// section state machine, the bar geometry and the release version arithmetic;
// everything that touches NSStatusItem lives in the executable.
let package = Package(
  name: "akbun-mactaskbar",
  platforms: [.macOS(.v14)],
  targets: [
    .target(name: "MacTaskbarCore"),
    .executableTarget(
      name: "akbun-mactaskbar",
      dependencies: ["MacTaskbarCore"]
    ),
    .testTarget(
      name: "MacTaskbarCoreTests",
      dependencies: ["MacTaskbarCore"]
    ),
  ]
)
