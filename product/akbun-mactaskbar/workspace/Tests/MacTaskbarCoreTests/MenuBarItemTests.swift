import Foundation
import Testing

@testable import MacTaskbarCore

@Suite("Item labels")
struct MenuBarItemTests {
  /// Most status items report the same generic description, so falling back to
  /// the owning process name is the difference between a readable list and
  /// twenty identical rows.
  @Test("the generic description falls back to the app name")
  func genericFallsBack() {
    #expect(displayLabel(rawLabel: genericItemLabel, app: "Rectangle") == "Rectangle")
    #expect(displayLabel(rawLabel: "Status Menu", app: "Rectangle") == "Rectangle")
  }

  @Test("an empty or missing description falls back to the app name")
  func emptyFallsBack() {
    #expect(displayLabel(rawLabel: nil, app: "Raycast") == "Raycast")
    #expect(displayLabel(rawLabel: "   ", app: "Raycast") == "Raycast")
  }

  @Test("a real description is kept")
  func realLabelKept() {
    #expect(displayLabel(rawLabel: "Wi‑Fi, connected, 3 bars", app: "ControlCenter") == "Wi‑Fi, connected, 3 bars")
  }
}

/// Control Center reported fifteen of these on the machine this was developed
/// against: zero-sized entries standing for system extras that are switched
/// off. Counting them puts phantom rows in the list and inflates the
/// off-screen tally, which is the number the window exists to show.
@Suite("Placeholder items")
struct PlaceholderTests {
  @Test("a zero-width item is a placeholder")
  func zeroWidth() {
    #expect(isPlaceholder(width: 0))
  }

  /// Position cannot be the test. An item genuinely pushed off screen keeps its
  /// real width, and the app's own dividers are the widest things on the bar.
  @Test("real widths are kept, on screen or not", arguments: [20.0, 22.0, 26.0, 123.0, 3458.0])
  func realWidthsKept(width: Double) {
    #expect(!isPlaceholder(width: width))
  }
}
