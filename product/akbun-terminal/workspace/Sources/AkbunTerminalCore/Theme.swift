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

/// The colour of a workspace name in the project panel.
///
/// Every other surface is mixed from the background and the text, so a session
/// name in the text colour sat among folders and buttons of the same colour and
/// had to be searched for. The complement of the theme's own blue is the one
/// hue nothing else in the window is drawn in, which is what lets the names
/// stand out in every theme rather than in the few where the text happens to be
/// bright.
extension CoreTheme {
  /// Contrast against the panel, WCAG's threshold for ordinary text.
  public static let sessionContrast = 4.5

  public var sessionForeground: RGB? {
    guard let panel = panelBackground, let blue = Self.rgb(palette.count > 4 ? palette[4] : "")
    else { return nil }
    let (hue, saturation, _) = Self.hsl(blue)
    let complement = (hue + 0.5).truncatingRemainder(dividingBy: 1)
    let vivid = max(saturation, 0.6)
    // Walk the lightness away from the panel until the name is readable on it.
    // Towards white on a dark panel, towards black on a light one.
    let dark = isDark
    var lightness = dark ? 0.55 : 0.45
    var colour = Self.rgb(hue: complement, saturation: vivid, lightness: lightness)
    while Self.contrast(colour, panel) < Self.sessionContrast {
      lightness += dark ? 0.05 : -0.05
      guard lightness > 0, lightness < 1 else { break }
      colour = Self.rgb(hue: complement, saturation: vivid, lightness: lightness)
    }
    return colour
  }

  /// WCAG contrast ratio, from 1 (the same colour) to 21 (black on white).
  public static func contrast(_ left: RGB, _ right: RGB) -> Double {
    let a = relativeLuminance(left)
    let b = relativeLuminance(right)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)
  }

  static func relativeLuminance(_ colour: RGB) -> Double {
    func linear(_ channel: UInt8) -> Double {
      let value = Double(channel) / 255
      return value <= 0.03928 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * linear(colour.red) + 0.7152 * linear(colour.green)
      + 0.0722 * linear(colour.blue)
  }

  /// Hue, saturation and lightness, each from 0 to 1.
  static func hsl(_ colour: RGB) -> (hue: Double, saturation: Double, lightness: Double) {
    let red = Double(colour.red) / 255
    let green = Double(colour.green) / 255
    let blue = Double(colour.blue) / 255
    let high = max(red, green, blue)
    let low = min(red, green, blue)
    let lightness = (high + low) / 2
    let delta = high - low
    guard delta > 0 else { return (0, 0, lightness) }
    let saturation = delta / (1 - abs(2 * lightness - 1))
    var hue: Double
    if high == red {
      hue = ((green - blue) / delta).truncatingRemainder(dividingBy: 6)
    } else if high == green {
      hue = (blue - red) / delta + 2
    } else {
      hue = (red - green) / delta + 4
    }
    hue /= 6
    if hue < 0 { hue += 1 }
    return (hue, min(saturation, 1), lightness)
  }

  static func rgb(hue: Double, saturation: Double, lightness: Double) -> RGB {
    let chroma = (1 - abs(2 * lightness - 1)) * saturation
    let sector = hue * 6
    let second = chroma * (1 - abs(sector.truncatingRemainder(dividingBy: 2) - 1))
    let (red, green, blue): (Double, Double, Double)
    switch Int(sector) % 6 {
    case 0: (red, green, blue) = (chroma, second, 0)
    case 1: (red, green, blue) = (second, chroma, 0)
    case 2: (red, green, blue) = (0, chroma, second)
    case 3: (red, green, blue) = (0, second, chroma)
    case 4: (red, green, blue) = (second, 0, chroma)
    default: (red, green, blue) = (chroma, 0, second)
    }
    let offset = lightness - chroma / 2
    func byte(_ value: Double) -> UInt8 {
      UInt8(min(255, max(0, ((value + offset) * 255).rounded())))
    }
    return (byte(red), byte(green), byte(blue))
  }
}
