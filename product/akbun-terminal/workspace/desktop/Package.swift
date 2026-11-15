// swift-tools-version: 6.0
import PackageDescription

// Three layers, in the order they are expected to outlive each other.
//
// CAkbunTerminalCore is the hand written header over the Rust static library.
// AkbunTerminalCore is the Swift side of the protocol and carries no AppKit, so
// the boundary can be tested without opening a window. The executable is the
// shell: windows, views, menus, and nothing else.
//
// The static library has to exist before `swift build` runs. scripts/build-core.sh
// produces it, and scripts/bundle.sh calls that first.
let package = Package(
  name: "akbun-terminal",
  platforms: [.macOS(.v14)],
  dependencies: [
    // The terminal emulator behind the view seam. A shell writes escape
    // sequences, so anything that does not interpret them is not a terminal.
    .package(url: "https://github.com/migueldeicaza/SwiftTerm", from: "1.19.0"),
    // Highlight.js behind a native NSAttributedString boundary. Language
    // grammars are maintained upstream instead of as lexer tables in the core.
    .package(url: "https://github.com/smittytone/HighlighterSwift", from: "3.1.0")
  ],
  targets: [
    .systemLibrary(name: "CAkbunTerminalCore", path: "Sources/CAkbunTerminalCore"),
    .target(
      name: "AkbunTerminalCore",
      dependencies: ["CAkbunTerminalCore"],
      linkerSettings: [
        // Relative to the package directory, which is where both scripts build from.
        .unsafeFlags(["-Lcore/target/release", "-lakbun_terminal_ffi"])
      ]
    ),
    .executableTarget(
      name: "akbun-terminal",
      dependencies: [
        "AkbunTerminalCore",
        .product(name: "Highlighter", package: "HighlighterSwift"),
        .product(name: "SwiftTerm", package: "SwiftTerm"),
      ],
      resources: [.copy("Resources")]
    ),
    .testTarget(
      name: "AkbunTerminalCoreTests",
      dependencies: ["AkbunTerminalCore"]
    ),
  ]
)
