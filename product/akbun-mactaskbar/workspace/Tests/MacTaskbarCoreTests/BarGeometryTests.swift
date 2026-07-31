import Foundation
import Testing

@testable import MacTaskbarCore

/// Numbers measured on a 16-inch display, 1728pt wide, whose bar was full.
/// `auxiliaryTopRightArea.minX` reported 956; the leftmost item macOS actually
/// drew sat at 993, and the four items below 956 were parked under the camera
/// housing with ordinary positive coordinates.
@Suite("Bar geometry")
struct BarGeometryTests {
  let notched = BarGeometry(drawableMinX: 956, screenWidth: 1728)
  let plain = BarGeometry(drawableMinX: 0, screenWidth: 1728)

  @Test("an item under the camera housing is not visible")
  func housingHidesPositiveX() {
    #expect(notched.isVisible(x: 993))
    #expect(!notched.isVisible(x: 955))
    #expect(!notched.isVisible(x: 925))
    #expect(!notched.isVisible(x: 878))
  }

  @Test("the housing edge itself is the first drawable position")
  func boundaryIsInclusive() {
    #expect(notched.isVisible(x: 956))
    #expect(!notched.isVisible(x: 955.5))
  }

  /// The whole point of separating geometry from the scan: a positive x used to
  /// mean visible, and on this display four items proved that wrong.
  @Test("a display without a housing draws from the left edge")
  func plainDisplayDrawsEverything() {
    #expect(plain.isVisible(x: 12))
    #expect(plain.isVisible(x: 878))
  }

  @Test("a divider pushed off the left edge is not visible")
  func negativeXIsHidden() {
    #expect(!notched.isVisible(x: -2265))
    #expect(!plain.isVisible(x: -2265))
  }

  @Test("an item past the right edge is not visible")
  func beyondRightEdge() {
    #expect(!plain.isVisible(x: 1728))
    #expect(plain.isVisible(x: 1727))
  }

  @Test("the housing is reported only when there is one")
  func housingFlag() {
    #expect(notched.hasCameraHousing)
    #expect(!plain.hasCameraHousing)
  }
}
