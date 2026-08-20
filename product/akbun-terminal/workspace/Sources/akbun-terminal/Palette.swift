import AppKit
import AkbunTerminalCore

/// Every colour the window draws with, from one theme or from the system.
///
/// A theme used to stop at the terminal, so choosing a dark scheme left a light
/// sidebar, a light tab strip and a light file list around a dark rectangle.
/// The window is one surface now: each view asks this for a colour rather than
/// naming a system one, and following the system appearance is a palette like
/// any other rather than a branch in every view.
///
/// The mixing itself is in the core package, where it can be tested without a
/// window. This file is only the part that has to be an `NSColor`.
///
/// Bound to the main actor because an `NSColor` is not `Sendable` and every
/// reader of this is a view. Saying so once here is what keeps each view from
/// having to say it again.
@MainActor
struct Palette {
  /// Behind the terminal and the document text.
  let background: NSColor
  /// Behind the sidebar, the file list and the tab strip.
  let panel: NSColor
  let text: NSColor
  let secondaryText: NSColor
  let selection: NSColor
  let separator: NSColor
  /// Nothing was chosen, so AppKit is left to follow dark and light mode on its
  /// own. Views still read the colours from here; the values are the dynamic
  /// system ones, which is what keeps the switch automatic.
  let followsSystem: Bool

  static let system = Palette(
    background: .textBackgroundColor,
    panel: .windowBackgroundColor,
    text: .labelColor,
    secondaryText: .secondaryLabelColor,
    selection: .selectedContentBackgroundColor,
    separator: .separatorColor,
    followsSystem: true
  )

  /// Nil when the theme carries a colour this build cannot read. All or
  /// nothing, because a window half dressed in a theme reads as a bug.
  init?(theme: CoreTheme) {
    guard let background = theme.backgroundRGB, let text = theme.foregroundRGB,
      let panel = theme.panelBackground, let secondary = theme.secondaryForeground,
      let selection = theme.selectionBackground, let separator = theme.separator
    else { return nil }
    self.background = NSColor(background)
    self.panel = NSColor(panel)
    self.text = NSColor(text)
    self.secondaryText = NSColor(secondary)
    self.selection = NSColor(selection)
    self.separator = NSColor(separator)
    self.followsSystem = false
  }

  private init(
    background: NSColor, panel: NSColor, text: NSColor, secondaryText: NSColor,
    selection: NSColor, separator: NSColor, followsSystem: Bool
  ) {
    self.background = background
    self.panel = panel
    self.text = text
    self.secondaryText = secondaryText
    self.selection = selection
    self.separator = separator
    self.followsSystem = followsSystem
  }

  /// The palette for a chosen theme, or the system one when nothing was chosen
  /// or the theme could not be read.
  static func of(_ theme: CoreTheme?) -> Palette {
    theme.flatMap(Palette.init(theme:)) ?? .system
  }

  /// The window's own appearance. Set so AppKit's own parts — the title bar, a
  /// scroller, a menu drawn over the window — match the theme rather than the
  /// system setting the theme just overrode.
  var appearance: NSAppearance? {
    followsSystem ? nil : NSAppearance(named: text.isLighter(than: background) ? .darkAqua : .aqua)
  }

  /// Text on a selected row. The selection is a mix of the background and the
  /// theme's blue, so the ordinary text colour still reads on it.
  var selectedText: NSColor { text }
}

extension NSColor {
  fileprivate convenience init(_ rgb: CoreTheme.RGB) {
    self.init(
      srgbRed: CGFloat(rgb.red) / 255, green: CGFloat(rgb.green) / 255,
      blue: CGFloat(rgb.blue) / 255, alpha: 1)
  }

  /// Compares two theme colours, which are always plain sRGB, so the conversion
  /// cannot fail in practice and a failure means "leave it alone".
  fileprivate func isLighter(than other: NSColor) -> Bool {
    guard let left = usingColorSpace(.sRGB), let right = other.usingColorSpace(.sRGB) else {
      return false
    }
    return left.brightnessComponent > right.brightnessComponent
  }
}

/// The colour a file's name is drawn in, from what git says about it.
///
/// The names are the ones every git client has settled on, which is the reason
/// to reuse them: a red row meaning "deleted" and a green one meaning "added"
/// is something the reader already knows before opening this app.
@MainActor
enum GitColor {
  static func of(_ status: CoreFileStatus?, in palette: Palette) -> NSColor {
    // Nothing to say about a file is the ordinary case, and it is drawn in the
    // ordinary colour rather than in a sixth shade of something.
    guard let status else { return palette.text }
    switch status {
    case .modified: return .systemOrange
    case .added: return .systemGreen
    case .renamed: return .systemPurple
    case .deleted: return .systemRed
    case .conflicted: return .systemPink
    // Untracked is the quiet one. A repository has more of these than anything
    // else, and a build directory should not be the loudest thing on screen.
    case .untracked: return .systemGray
    }
  }
}
