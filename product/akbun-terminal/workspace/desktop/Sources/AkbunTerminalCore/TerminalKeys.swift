import Foundation

/// The keystrokes this app encodes itself, before the emulator sees them.
///
/// There is exactly one so far, and it is here rather than in the view for the
/// same reason the URL rule is in the core: the emulator behind the seam is
/// expected to be replaced, and a key that stops working after that swap is a
/// bug nobody would look for in a new file. The view answers which physical key
/// was pressed and with what held down; what that means in bytes is decided
/// here, where it can be checked without opening a window.
public enum TerminalKeys {
  /// macOS virtual key codes. Return and the keypad's Enter are different keys
  /// and people press both.
  public static let returnKeyCode: UInt16 = 36
  public static let keypadEnterKeyCode: UInt16 = 76

  /// Escape then carriage return: what shift and return send.
  ///
  /// A terminal has no way to say "shift was held" with return, because the
  /// byte for return is the same byte either way. Every CLI that offers a
  /// multi-line prompt therefore agrees on a substitute, and the one they agree
  /// on is meta return: Claude Code's own terminal setup installs exactly this
  /// sequence into iTerm2 and VS Code, and Codex and Gemini read it too.
  public static let escapeReturn: [UInt8] = [0x1b, 0x0d]

  /// What to send for a key press, or nil to leave it to the emulator.
  ///
  /// Nil for everything but shift and return, so this cannot become a second
  /// keyboard layout sitting in front of the one SwiftTerm already implements.
  public static func bytes(keyCode: UInt16, shift: Bool) -> [UInt8]? {
    guard shift, keyCode == returnKeyCode || keyCode == keypadEnterKeyCode else { return nil }
    return escapeReturn
  }
}
