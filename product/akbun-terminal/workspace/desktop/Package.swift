// swift-tools-version: 6.0
import PackageDescription

// Two products, in the order they are expected to outlive each other.
//
// The daemon (akbun-terminal-core, built by Cargo one directory up) owns the
// shells, the project tree and agent status, and draws nothing. This package is
// its Swift client. AkbunTerminalCore is the socket and protocol side and
// carries no AppKit, so it can be tested against a real daemon without opening a
// window. The executable is the shell: windows, views, menus, and nothing else.
//
// Nothing here links against Rust. The daemon binary has to exist before the
// tests run and before bundling; scripts/build-core.sh produces it.
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
    .target(name: "AkbunTerminalCore"),
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
