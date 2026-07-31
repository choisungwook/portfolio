import Foundation

/// One status item on the bar, as read through the accessibility API.
public struct MenuBarItem: Equatable, Sendable, Identifiable {
  /// Name of the process that owns the item.
  public let app: String
  /// Accessibility description, or the app name when the item reports the
  /// generic description every unlabelled status item shares.
  public let label: String
  public let x: CGFloat
  public let visible: Bool

  public var id: String { "\(app)-\(label)-\(x)" }

  public init(app: String, label: String, x: CGFloat, visible: Bool) {
    self.app = app
    self.label = label
    self.x = x
    self.visible = visible
  }
}

/// Description every unlabelled status item reports. It says nothing, so the
/// owning process name is the better label.
public let genericItemLabel = "status menu"

/// Control Center lists one entry per system extra that is switched off. They
/// report zero size at the top-left corner of the screen and stand for nothing
/// on the bar, so counting them would put fifteen phantom rows in the list and
/// fifteen phantom entries in the off-screen tally.
///
/// Width is the test rather than position. An item genuinely pushed off screen
/// keeps its real width, so this drops the placeholders without touching the
/// items the list exists to report.
public func isPlaceholder(width: CGFloat) -> Bool {
  width <= 0
}

public func displayLabel(rawLabel: String?, app: String) -> String {
  guard let raw = rawLabel?.trimmingCharacters(in: .whitespacesAndNewlines),
    !raw.isEmpty,
    raw.caseInsensitiveCompare(genericItemLabel) != .orderedSame
  else { return app }
  return raw
}
