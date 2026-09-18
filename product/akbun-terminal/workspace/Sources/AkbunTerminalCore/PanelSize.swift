import Foundation

public struct PanelSize {
  public static let minimum: Double = 75
  public static let maximum: Double = 200
  private static let key = "panelSizePercent"
  private let defaults: UserDefaults
  public private(set) var percent: Double

  public init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    let saved = (defaults.object(forKey: Self.key) as? NSNumber)?.doubleValue ?? 100
    percent = Self.clamp(saved)
  }

  public var zoom: Zoom {
    Zoom(terminalFontSize: Zoom.base * percent / 100)
  }

  public mutating func set(percent: Double) {
    self.percent = Self.clamp(percent)
    defaults.set(self.percent, forKey: Self.key)
  }

  private static func clamp(_ percent: Double) -> Double {
    percent.isFinite ? min(maximum, max(minimum, percent)) : 100
  }
}
