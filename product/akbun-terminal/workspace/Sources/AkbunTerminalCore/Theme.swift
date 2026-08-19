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
