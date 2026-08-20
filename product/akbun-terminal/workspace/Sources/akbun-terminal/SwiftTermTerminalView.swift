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
  var onCellClick: ((String, Int, NSPoint) -> Void)?

  var view: NSView { self }
  var focusView: NSView { terminal }

  private let terminal = ClickableTerminalView()
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
    terminal.onPlainClick = { [weak self] point in self?.reportClick(at: point) ?? false }
    terminal.translatesAutoresizingMaskIntoConstraints = false
    addSubview(terminal)
    NSLayoutConstraint.activate([
      terminal.topAnchor.constraint(equalTo: topAnchor),
      terminal.bottomAnchor.constraint(equalTo: bottomAnchor),
      terminal.leadingAnchor.constraint(equalTo: leadingAnchor),
      terminal.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
  }

  /// Shift and return, before the emulator sees it.
  ///
  /// A key equivalent rather than a `keyDown` override, because SwiftTerm's
  /// `keyDown` is public and not open: it cannot be overridden from this module
  /// at all. The window offers every key press to this hierarchy here first,
  /// which is the same route a default button's return takes, so the one key
  /// this app encodes itself is answered before anything else reads it.
  ///
  /// Only while the terminal holds the keyboard. This view is on screen for a
  /// shell tab, and a document tab beside it has its own idea of what return
  /// means.
  override func performKeyEquivalent(with event: NSEvent) -> Bool {
    guard !ended, terminalHasFocus,
      let bytes = TerminalKeys.bytes(
        keyCode: event.keyCode, shift: event.modifierFlags.contains(.shift))
    else { return super.performKeyEquivalent(with: event) }
    onInput?(bytes)
    return true
  }

  private var terminalHasFocus: Bool {
    guard let responder = window?.firstResponder as? NSView else { return false }
    return responder === terminal || responder.isDescendant(of: terminal)
  }

  var grid: (cols: UInt16, rows: UInt16) {
    let size = terminal.getTerminal()
    return (UInt16(max(1, size.cols)), UInt16(max(1, size.rows)))
  }

  /// Zoom. SwiftTerm recomputes its cell size from the font and then reports the
  /// new grid through `sizeChanged`, which is what resizes the pty, so nothing
  /// here has to work out how many cells fit.
  var fontSize: Double {
    get { terminal.font.pointSize }
    set { terminal.font = NSFont.monospacedSystemFont(ofSize: newValue, weight: .regular) }
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

  /// Turns a point into the row's text and the column the click fell in.
  ///
  /// This calculation belongs to whatever draws the cells, which is why it sits
  /// behind the seam rather than in the controller: a different engine measures
  /// its grid differently, and only the answer travels upwards.
  private func reportClick(at point: NSPoint) -> Bool {
    guard let onCellClick,
      let cell = terminal.cellSizeInPixels(source: terminal.getTerminal()),
      cell.width > 0, cell.height > 0
    else { return false }
    let scale = window?.backingScaleFactor ?? 2
    let column = Int(point.x / (Double(cell.width) / scale))
    let row = Int((terminal.bounds.height - point.y) / (Double(cell.height) / scale))
    guard let line = terminal.getTerminal().getLine(row: row) else { return false }
    onCellClick(line.translateToString(trimRight: true), column, convert(point, from: terminal))
    return true
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

/// A terminal view that reports a plain click before it does anything with it.
///
/// A click that dragged is a selection and a click while a full screen program
/// is reading the mouse belongs to that program, so neither is offered. What is
/// left is the gesture a person makes at a URL.
private final class ClickableTerminalView: TerminalView {
  /// Returns whether the click was consumed.
  var onPlainClick: ((NSPoint) -> Bool)?

  private var pressedAt: NSPoint?

  override func mouseDown(with event: NSEvent) {
    pressedAt = convert(event.locationInWindow, from: nil)
    super.mouseDown(with: event)
  }

  override func mouseUp(with event: NSEvent) {
    let point = convert(event.locationInWindow, from: nil)
    let dragged = pressedAt.map { hypot(point.x - $0.x, point.y - $0.y) > 3 } ?? true
    pressedAt = nil
    if !dragged, getTerminal().mouseMode == .off, event.clickCount == 1,
      onPlainClick?(point) == true
    {
      return
    }
    super.mouseUp(with: event)
  }
}
