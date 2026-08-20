import Foundation

/// A shortcut as the core writes it, taken apart for a menu item.
///
/// The core stores `cmd+shift+f`. AppKit wants two things that are not that: a
/// one character key equivalent and a modifier mask. Turning one into the other
/// is the only part of a rebindable menu that can be wrong, so it lives here,
/// beside the protocol and away from AppKit, where a test can reach it without
/// opening a window.
///
/// The mask is an option set of this package's own rather than
/// `NSEvent.ModifierFlags`, which keeps AppKit out of the layer that is meant to
/// be testable. The shell turns it into the AppKit one in a single line.
public struct ShortcutKey: Equatable, Sendable {
  public struct Modifiers: OptionSet, Sendable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }

    public static let command = Modifiers(rawValue: 1 << 0)
    public static let control = Modifiers(rawValue: 1 << 1)
    public static let option = Modifiers(rawValue: 1 << 2)
    public static let shift = Modifiers(rawValue: 1 << 3)
  }

  /// What goes in `NSMenuItem.keyEquivalent`: one character, lower case, or the
  /// unicode value of a key that has no printable character.
  public let equivalent: String
  public let modifiers: Modifiers

  public init(equivalent: String, modifiers: Modifiers) {
    self.equivalent = equivalent
    self.modifiers = modifiers
  }

  /// The names the core uses for keys that are not one character, and what
  /// AppKit expects instead. The arrow and page keys are the unicode function
  /// key block, which is what a menu item matches against.
  private static let named: [String: String] = [
    "plus": "+",
    "minus": "-",
    "space": " ",
    "tab": "\t",
    "return": "\r",
    "escape": "\u{1b}",
    "delete": "\u{8}",
    "left": "\u{f702}",
    "right": "\u{f703}",
    "up": "\u{f700}",
    "down": "\u{f701}",
    "home": "\u{f729}",
    "end": "\u{f72b}",
    "pageup": "\u{f72c}",
    "pagedown": "\u{f72d}",
  ]

  /// The other direction, for the settings window, which shows what a person
  /// pressed rather than what the menu matched.
  private static let displayed: [String: String] = [
    "plus": "+",
    "minus": "−",
    "space": "Space",
    "tab": "⇥",
    "return": "↩",
    "escape": "⎋",
    "delete": "⌫",
    "left": "←",
    "right": "→",
    "up": "↑",
    "down": "↓",
    "home": "↖",
    "end": "↘",
    "pageup": "⇞",
    "pagedown": "⇟",
  ]

  /// Reads `cmd+shift+f`. Nil for anything this build cannot put on a menu, so
  /// a saved shortcut from a newer core leaves the item without a key rather
  /// than with the wrong one.
  public static func parse(_ text: String) -> ShortcutKey? {
    var modifiers = Modifiers()
    var base: String?
    for part in text.split(separator: "+", omittingEmptySubsequences: false) {
      let part = part.trimmingCharacters(in: .whitespaces).lowercased()
      if part.isEmpty {
        // The plus key itself, which the separator swallowed.
        guard base == nil || base == "plus" else { return nil }
        base = "plus"
        continue
      }
      switch part {
      case "cmd", "command", "meta": modifiers.insert(.command)
      case "ctrl", "control": modifiers.insert(.control)
      case "alt", "opt", "option": modifiers.insert(.option)
      case "shift": modifiers.insert(.shift)
      default:
        guard base == nil else { return nil }
        base = part
      }
    }
    guard let base, !base.isEmpty else { return nil }
    if let equivalent = named[base] {
      return ShortcutKey(equivalent: equivalent, modifiers: modifiers)
    }
    if base.count == 1 {
      return ShortcutKey(equivalent: base, modifiers: modifiers)
    }
    // A function key: F1 through F20 are one unicode value each, counting up.
    if base.hasPrefix("f"), let number = Int(base.dropFirst()), (1...20).contains(number),
      let scalar = UnicodeScalar(0xf704 + number - 1)
    {
      return ShortcutKey(equivalent: String(Character(scalar)), modifiers: modifiers)
    }
    return nil
  }

  /// The keystroke as a person reads it: ⌘⇧F. The order is the one macOS uses
  /// on every menu, which is not the order the core stores.
  public static func display(_ text: String) -> String {
    var symbols = ""
    var base = ""
    for part in text.split(separator: "+", omittingEmptySubsequences: false) {
      let part = part.trimmingCharacters(in: .whitespaces).lowercased()
      if part.isEmpty {
        base = "+"
        continue
      }
      switch part {
      case "cmd", "command", "meta": symbols += "⌘"
      case "ctrl", "control": symbols += "⌃"
      case "alt", "opt", "option": symbols += "⌥"
      case "shift": symbols += "⇧"
      default: base = displayed[part] ?? part.uppercased()
      }
    }
    // macOS draws them control, option, shift, command whatever order they were
    // typed in, so the string is rebuilt rather than appended to.
    let order = ["⌃", "⌥", "⇧", "⌘"]
    return order.filter { symbols.contains($0) }.joined() + base
  }

  /// What a key press is called in the core's spelling, from the pieces a view
  /// gets out of an event. Nil when nothing was held down, because a bare key
  /// belongs to the terminal in the middle of the window.
  public static func describe(character: String, modifiers: Modifiers) -> String? {
    let character = character.lowercased()
    guard !character.isEmpty else { return nil }
    let base: String
    if let name = named.first(where: { $0.value == character })?.key {
      base = name
    } else if character == "=" {
      base = "plus"
    } else if character == "_" {
      base = "minus"
    } else if character.count == 1 {
      base = character
    } else {
      return nil
    }
    guard modifiers.contains(.command) || modifiers.contains(.control)
      || modifiers.contains(.option)
    else { return nil }
    var text = ""
    for (flag, name) in [
      (Modifiers.command, "cmd"), (.control, "ctrl"), (.option, "alt"), (.shift, "shift"),
    ] where modifiers.contains(flag) {
      text += "\(name)+"
    }
    return text + base
  }
}
