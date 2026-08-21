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
  /// The theme's own emphasis colour. Active controls use this instead of a
  /// mathematical RGB inverse, which is not guaranteed to remain readable.
  let accent: NSColor
  let selection: NSColor
  let separator: NSColor
  /// The closest Highlight.js theme shipped by HighlighterSwift.
  let syntaxTheme: String
  /// Nothing was chosen, so AppKit is left to follow dark and light mode on its
  /// own. Views still read the colours from here; the values are the dynamic
  /// system ones, which is what keeps the switch automatic.
  let followsSystem: Bool

  static let system = Palette(
    background: .textBackgroundColor,
    panel: .windowBackgroundColor,
    text: .labelColor,
    secondaryText: .secondaryLabelColor,
    accent: .controlAccentColor,
    selection: .selectedContentBackgroundColor,
    separator: .separatorColor,
    syntaxTheme: "system",
    followsSystem: true
  )

  /// Nil when the theme carries a colour this build cannot read. All or
  /// nothing, because a window half dressed in a theme reads as a bug.
  init?(theme: CoreTheme) {
    guard let background = theme.backgroundRGB, let text = theme.foregroundRGB,
      let panel = theme.panelBackground, let secondary = theme.secondaryForeground,
      let accent = theme.rgbPalette?[4],
      let selection = theme.selectionBackground, let separator = theme.separator
    else { return nil }
    self.background = NSColor(background)
    self.panel = NSColor(panel)
    self.text = NSColor(text)
    self.secondaryText = NSColor(secondary)
    self.accent = NSColor(accent)
    self.selection = NSColor(selection)
    self.separator = NSColor(separator)
    self.syntaxTheme = Self.syntaxTheme(for: theme.name, dark: theme.isDark)
    self.followsSystem = false
  }

  private init(
    background: NSColor, panel: NSColor, text: NSColor, secondaryText: NSColor,
    accent: NSColor, selection: NSColor, separator: NSColor, syntaxTheme: String,
    followsSystem: Bool
  ) {
    self.background = background
    self.panel = panel
    self.text = text
    self.secondaryText = secondaryText
    self.accent = accent
    self.selection = selection
    self.separator = separator
    self.syntaxTheme = syntaxTheme
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

  var isDark: Bool { text.isLighter(than: background) }

  var resolvedSyntaxTheme: String {
    syntaxTheme == "system" ? (isDark ? "github-dark" : "github") : syntaxTheme
  }

  private static func syntaxTheme(for name: String, dark: Bool) -> String {
    switch name {
    case "Dracula": return "dracula"
    case "Nord": return "nord"
    case "Solarized Dark": return "solarized-dark"
    case "Solarized Light": return "solarized-light"
    case "Gruvbox Dark": return "gruvbox-dark"
    case "Gruvbox Light": return "gruvbox-light"
    case "Tokyo Night": return "tokyo-night-dark"
    case "Tokyo Night Day": return "tokyo-night-light"
    case "One Dark": return "atom-one-dark-reasonable"
    case "One Light": return "atom-one-light"
    case "Monokai": return "monokai"
    case "Rosé Pine": return "rose-pine"
    case "Rosé Pine Dawn": return "rose-pine-dawn"
    case "GitHub Light", "Light": return "github"
    default: return dark ? "github-dark" : "github"
    }
  }
}

extension NSColor {
  fileprivate convenience init(_ rgb: CoreTheme.RGB) {
    self.init(
      srgbRed: CGFloat(rgb.red) / 255, green: CGFloat(rgb.green) / 255,
      blue: CGFloat(rgb.blue) / 255, alpha: 1)
  }

  /// Compares two theme colours, which are always plain sRGB, so the conversion
  /// cannot fail in practice and a failure means "leave it alone".
  @MainActor fileprivate func isLighter(than other: NSColor) -> Bool {
    guard let left = resolvedRGB, let right = other.resolvedRGB
    else {
      return false
    }
    return left.brightnessComponent > right.brightnessComponent
  }

  @MainActor var cssHex: String {
    let colour = resolvedRGB ?? self
    return String(
      format: "#%02x%02x%02x", Int(colour.redComponent * 255),
      Int(colour.greenComponent * 255), Int(colour.blueComponent * 255))
  }

  @MainActor private var resolvedRGB: NSColor? {
    var colour: NSColor?
    NSApp.effectiveAppearance.performAsCurrentDrawingAppearance {
      colour = usingColorSpace(.sRGB)
    }
    return colour
  }
}

/// The colour a file's name is drawn in, from what git says about it.
///
/// Green for staged and orange for not is the pair every git client has settled
/// on, which is the reason to reuse it: the reader already knows it before
/// opening this app. The colour answers "has git been told about this yet",
/// because that is the question somebody who has just typed `git add` is asking
/// the pane; the badge beside the name answers what happened.
///
/// So a staged delete is green rather than red, and a staged rename green
/// rather than purple. Red and purple are what those look like while they are
/// still only in the working tree. One row cannot carry two questions in one
/// colour, and the D or the R after the name is the other one.
@MainActor
enum GitColor {
  static func of(_ entry: CoreGitEntry?, in palette: Palette) -> NSColor {
    // Nothing to say about a file is the ordinary case, and it is drawn in the
    // ordinary colour rather than in a sixth shade of something.
    guard let entry else { return palette.text }
    switch entry.status {
    case .conflicted: return .systemPink
    // Untracked is the quiet one. A repository has more of these than anything
    // else, and a build directory should not be the loudest thing on screen.
    case .untracked: return .systemGray
    default: break
    }
    switch entry.stage {
    case .staged: return .systemGreen
    // Staged and then changed again: a commit now would take half of it, and
    // neither of the two colours would be telling the truth on its own.
    case .both: return .systemYellow
    case .unstaged:
      switch entry.status {
      case .deleted: return .systemRed
      case .renamed: return .systemPurple
      default: return .systemOrange
      }
    }
  }
}

/// The letter drawn after a name, and the words behind it.
///
/// A colour alone cannot be told apart by everyone looking at it, and the two
/// git halves are now two shades of the same idea. The letter is git's own, so
/// it says the same thing as the shell in the middle of the window.
@MainActor
enum GitBadge {
  static func of(_ entry: CoreGitEntry) -> String {
    switch entry.status {
    case .untracked: return "?"
    case .conflicted: return "!"
    case .added: return mark("A", entry.stage)
    case .modified: return mark("M", entry.stage)
    case .deleted: return mark("D", entry.stage)
    case .renamed: return mark("R", entry.stage)
    }
  }

  /// What the row means, spelled out for a tooltip and for anyone who reads the
  /// pane with something other than their eyes.
  static func describe(_ entry: CoreGitEntry) -> String {
    switch entry.status {
    case .untracked: return "untracked"
    case .conflicted: return "conflicted"
    default: break
    }
    switch entry.stage {
    case .staged: return "\(entry.status.rawValue), staged"
    case .unstaged: return "\(entry.status.rawValue), not staged"
    case .both: return "\(entry.status.rawValue), staged with further changes"
    }
  }

  /// The star is the "and changed again" half. Two letters would read as a
  /// porcelain code, which is a different thing.
  private static func mark(_ letter: String, _ stage: CoreFileStage) -> String {
    stage == .both ? "\(letter)*" : letter
  }
}
