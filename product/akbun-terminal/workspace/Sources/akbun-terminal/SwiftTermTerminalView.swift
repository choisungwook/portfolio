import AppKit
import AkbunTerminalCore
import SwiftTerm

/// The terminal view behind the seam, drawn by SwiftTerm.
///
/// Escape sequences are what a shell mostly writes: colours, cursor moves, the
/// prompt redrawing itself as you type. Anything that does not interpret them
/// shows the codes as text and never moves a cursor, which is what the first
/// build did. SwiftTerm is an emulator, so it is the whole fix.
///
/// It draws only. The pty, the session and its lifetime stay in the core, so
/// swapping this file for a GPU accelerated engine later moves nothing else.
// SwiftTerm's delegate is not actor annotated, but every call it makes comes
// from the view's own event handling on the main thread. `@preconcurrency` says
// so instead of hopping each callback through a task, which would deliver
// keystrokes out of order.
final class SwiftTermTerminalView: NSView, TerminalRendering, @preconcurrency TerminalViewDelegate {
  var onInput: (([UInt8]) -> Void)?
  var onGridChange: ((UInt16, UInt16) -> Void)?

  var view: NSView { self }
  var focusView: NSView { terminal }

  private let terminal = TerminalView()
  private var ended = false

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    setUp()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setUp()
  }

  private func setUp() {
    terminal.terminalDelegate = self
    terminal.font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
    // Takes the colours from the system appearance, which is what makes the view
    // follow dark and light mode without a palette of its own.
    terminal.configureNativeColors()
    terminal.translatesAutoresizingMaskIntoConstraints = false
    addSubview(terminal)
    NSLayoutConstraint.activate([
      terminal.topAnchor.constraint(equalTo: topAnchor),
      terminal.bottomAnchor.constraint(equalTo: bottomAnchor),
      terminal.leadingAnchor.constraint(equalTo: leadingAnchor),
      terminal.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
  }

  var grid: (cols: UInt16, rows: UInt16) {
    let size = terminal.getTerminal()
    return (UInt16(max(1, size.cols)), UInt16(max(1, size.rows)))
  }

  /// Installs a colour scheme, or hands the view back to the system appearance
  /// when there is none. Following the system is the only setting that changes
  /// with dark and light mode, so it is what an unset theme means.
  func apply(theme: CoreTheme?) {
    guard let theme, let palette = theme.rgbPalette,
      let background = CoreTheme.rgb(theme.background),
      let foreground = CoreTheme.rgb(theme.foreground)
    else {
      terminal.configureNativeColors()
      return
    }
    terminal.installColors(palette.map(Self.color))
    terminal.nativeBackgroundColor = Self.native(background)
    terminal.nativeForegroundColor = Self.native(foreground)
    if let cursor = CoreTheme.rgb(theme.cursor) {
      terminal.caretColor = Self.native(cursor)
    }
  }

  private static func color(_ rgb: (red: UInt8, green: UInt8, blue: UInt8)) -> SwiftTerm.Color {
    SwiftTerm.Color(
      red8: UInt16(rgb.red), green8: UInt16(rgb.green), blue8: UInt16(rgb.blue))
  }

  private static func native(_ rgb: (red: UInt8, green: UInt8, blue: UInt8)) -> NSColor {
    NSColor(
      srgbRed: Double(rgb.red) / 255, green: Double(rgb.green) / 255,
      blue: Double(rgb.blue) / 255, alpha: 1)
  }

  func present(bytes: [UInt8]) {
    terminal.feed(byteArray: bytes[...])
  }

  func presentExit() {
    guard !ended else { return }
    ended = true
    terminal.feed(text: "\r\n[process exited]\r\n")
  }

  // MARK: TerminalViewDelegate

  func send(source: TerminalView, data: ArraySlice<UInt8>) {
    // A finished shell has nothing to read the keys, and writing to a closed
    // session would come back as an error on every keystroke.
    guard !ended else { return }
    onInput?(Array(data))
  }

  func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
    onGridChange?(UInt16(max(1, newCols)), UInt16(max(1, newRows)))
  }

  func setTerminalTitle(source: TerminalView, title: String) {}

  func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}

  func scrolled(source: TerminalView, position: Double) {}

  func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}
}
