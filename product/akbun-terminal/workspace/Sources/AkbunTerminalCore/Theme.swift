import Foundation

extension CoreTheme {
  /// `#rrggbb` to three bytes, or nil for anything else.
  ///
  /// Parsing lives here rather than next to the views because it is the only
  /// part of applying a theme that can be wrong, and this is the side of the
  /// package that can be tested without opening a window.
  public static func rgb(_ hex: String) -> (red: UInt8, green: UInt8, blue: UInt8)? {
    guard hex.count == 7, hex.hasPrefix("#"),
      let value = UInt32(hex.dropFirst(), radix: 16)
    else { return nil }
    return (UInt8(value >> 16 & 0xff), UInt8(value >> 8 & 0xff), UInt8(value & 0xff))
  }

  /// The sixteen ANSI colours, or nil when any of them is unreadable. All or
  /// nothing, because a palette missing one colour draws worse than none.
  public var rgbPalette: [(red: UInt8, green: UInt8, blue: UInt8)]? {
    let parsed = palette.compactMap(Self.rgb)
    return parsed.count == 16 ? parsed : nil
  }
}

/// The colours the rest of the window wears when a theme is chosen.
///
/// A theme used to reach the terminal and nothing else, so a dark scheme left a
/// light sidebar, a light tab strip and a light file list around it. Every
/// surface in the window comes from the same three colours now, mixed here
/// rather than in the views: this is the half that can be checked without
/// opening a window, and mixing in each view is how two panes end up almost the
/// same colour instead of the same colour.
extension CoreTheme {
  public typealias RGB = (red: UInt8, green: UInt8, blue: UInt8)

  /// Perceived brightness, the usual weighting. Used to decide nothing but
  /// which direction a surface is nudged in.
  public var luminance: Double {
    guard let background = Self.rgb(background) else { return 1 }
    return (0.2126 * Double(background.red) + 0.7152 * Double(background.green)
      + 0.0722 * Double(background.blue)) / 255
  }

  public var isDark: Bool { luminance < 0.5 }

  /// `amount` of `other` mixed into `base`, per channel.
  public static func blend(_ base: RGB, _ other: RGB, amount: Double) -> RGB {
    func mix(_ left: UInt8, _ right: UInt8) -> UInt8 {
      let value = Double(left) + (Double(right) - Double(left)) * min(max(amount, 0), 1)
      return UInt8(min(255, max(0, value.rounded())))
    }
    return (mix(base.red, other.red), mix(base.green, other.green), mix(base.blue, other.blue))
  }

  public var backgroundRGB: RGB? { Self.rgb(background) }
  public var foregroundRGB: RGB? { Self.rgb(foreground) }

  /// The sidebar and the file pane. Set apart from the terminal by a nudge
  /// towards the text colour, which is the same move in a dark theme and a
  /// light one and needs no second rule for either.
  public var panelBackground: RGB? {
    guard let background = backgroundRGB, let foreground = foregroundRGB else { return nil }
    return Self.blend(background, foreground, amount: 0.07)
  }

  /// A row that is not the point: a folder icon, a tooltip, a path.
  public var secondaryForeground: RGB? {
    guard let background = backgroundRGB, let foreground = foregroundRGB else { return nil }
    return Self.blend(foreground, background, amount: 0.45)
  }

  public var separator: RGB? {
    guard let background = backgroundRGB, let foreground = foregroundRGB else { return nil }
    return Self.blend(background, foreground, amount: 0.2)
  }

  /// The selected workspace and the active tab. The theme's own blue is used
  /// rather than the system accent, because the point of choosing a scheme is
  /// that the window stops borrowing colours from somewhere else.
  public var selectionBackground: RGB? {
    guard let background = backgroundRGB, let blue = Self.rgb(palette.count > 4 ? palette[4] : "")
    else { return nil }
    return Self.blend(background, blue, amount: 0.55)
  }
}
