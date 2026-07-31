import AppKit
import MacTaskbarCore

extension NSScreen {
  /// Reads the drawable region of the menu bar from the screen itself.
  ///
  /// `auxiliaryTopRightArea` is the part of the bar to the right of a camera
  /// housing, and it is nil on a display without one. Its left edge is where
  /// status items start being drawn, so it is the only number needed to tell a
  /// visible item from one parked under the housing.
  var barGeometry: BarGeometry {
    BarGeometry(
      drawableMinX: auxiliaryTopRightArea?.minX ?? 0,
      screenWidth: frame.width
    )
  }
}

@MainActor
func currentBarGeometry() -> BarGeometry {
  // Status items always live on the screen holding the menu bar, which is the
  // first entry regardless of which screen has focus.
  NSScreen.screens.first?.barGeometry ?? BarGeometry(drawableMinX: 0, screenWidth: 1440)
}
