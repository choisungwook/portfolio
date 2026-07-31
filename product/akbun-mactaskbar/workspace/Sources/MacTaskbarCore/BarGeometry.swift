import Foundation

/// Where the menu bar actually draws status items.
///
/// On a display with a camera housing the bar is split in two and status items
/// only ever land in the right half. An item that does not fit there is placed
/// under the housing, keeps a perfectly ordinary positive x, and is drawn
/// nowhere. Treating "x is on screen" as "the user can see it" therefore
/// reports items as visible that nobody can click, which is the single most
/// confusing thing a menu bar manager can get wrong.
///
/// `drawableMinX` is the left edge of the region that really draws: the right
/// edge of the housing, or 0 on a display without one.
public struct BarGeometry: Equatable, Sendable {
  public let drawableMinX: CGFloat
  public let screenWidth: CGFloat

  public init(drawableMinX: CGFloat, screenWidth: CGFloat) {
    self.drawableMinX = drawableMinX
    self.screenWidth = screenWidth
  }

  public var hasCameraHousing: Bool { drawableMinX > 0 }

  /// An item is visible when its left edge falls inside the drawable region. A
  /// divider pushed off the left edge reports a negative x and fails this, which
  /// is exactly the state the item list exists to report.
  public func isVisible(x: CGFloat) -> Bool {
    x >= drawableMinX && x < screenWidth
  }
}
