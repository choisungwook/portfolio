import Foundation

public struct Zoom: Equatable, Sendable {
  /// The terminal's point size at the default zoom. Every other size in the
  /// window is expressed as a multiple of its own default against this one.
  public static let base: Double = 13
  public static let smallest: Double = 7
  public static let largest: Double = 36

  public private(set) var terminalFontSize: Double

  public init(terminalFontSize: Double = Zoom.base) {
    self.terminalFontSize = Self.clamp(terminalFontSize)
  }

  /// Steps up or down, or back to the default at zero. Zero is the reset rather
  /// than a separate call because the menu has one action per direction and
  /// "Default Size" is the third of them.
  public mutating func step(by steps: Double) {
    terminalFontSize = steps == 0 ? Self.base : Self.clamp(terminalFontSize + steps)
  }

  /// What every other size is multiplied by.
  public var scale: Double { terminalFontSize / Self.base }

  /// The drawn size of something that is `points` at the default zoom. Rounded,
  /// because a font at a fractional size draws blurred against the pixel grid.
  public func size(_ points: Double) -> Double {
    (points * scale).rounded()
  }

  private static func clamp(_ size: Double) -> Double {
    min(largest, max(smallest, size))
  }
}
