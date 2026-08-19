import AppKit

/// What the shell needs from whatever draws a terminal.
///
/// Deliberately small, because this is the seam the product expects to move: the
/// first implementation is a plain text view, and a GPU accelerated terminal
/// engine can take its place without the session code above noticing. Anything
/// that has to survive that swap belongs in the core, not here.
@MainActor
protocol TerminalRendering: AnyObject {
  var view: NSView { get }

  /// Called with keystrokes on their way to the shell.
  var onInput: (([UInt8]) -> Void)? { get set }

  /// Called when the view decides it now covers a different number of cells.
  var onGridChange: ((UInt16, UInt16) -> Void)? { get set }

  /// Current size in cells, used for the first spawn before any resize fires.
  var grid: (cols: UInt16, rows: UInt16) { get }

  /// Shell output. Bytes, not text, because a terminal stream is not guaranteed
  /// to split on character boundaries.
  func present(bytes: [UInt8])

  /// The shell ended. The view stops taking keys and says so on screen.
  func presentExit()
}
