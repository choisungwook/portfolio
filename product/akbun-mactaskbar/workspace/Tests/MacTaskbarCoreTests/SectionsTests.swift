import Foundation
import Testing

@testable import MacTaskbarCore

@Suite("Section state machine")
struct SectionsTests {
  @Test("cycling returns to where it started")
  func cycleWraps() {
    #expect(Section.collapsed.next == .expanded)
    #expect(Section.expanded.next == .all)
    #expect(Section.all.next == .collapsed)
  }

  /// The bug that hides everything for good: if `all` leaves a divider wide,
  /// the user can never drag an icon across it to assign a section.
  @Test("all collapses both dividers")
  func allNarrowsBoth() {
    let widths = dividerWidths(for: .all, screenWidth: 1728)
    #expect(widths.hidden == narrowDividerWidth)
    #expect(widths.alwaysHidden == narrowDividerWidth)
  }

  @Test("collapsed widens both dividers")
  func collapsedWidensBoth() {
    let widths = dividerWidths(for: .collapsed, screenWidth: 1728)
    #expect(widths.hidden > 1728)
    #expect(widths.alwaysHidden > 1728)
  }

  @Test("expanded reveals the hidden section only")
  func expandedRevealsOne() {
    let widths = dividerWidths(for: .expanded, screenWidth: 1728)
    #expect(widths.hidden == narrowDividerWidth)
    #expect(widths.alwaysHidden > 1728)
  }

  /// A divider narrower than the screen would leave the icons it is meant to
  /// push off still partly on it.
  @Test("a wide divider always outruns the screen", arguments: [1280.0, 1728.0, 3008.0])
  func wideOutrunsScreen(width: Double) {
    #expect(wideDividerWidth(screenWidth: width) > width)
  }

  @Test("a small screen still gets a usable divider")
  func minimumWidth() {
    #expect(wideDividerWidth(screenWidth: 100) >= 2000)
  }
}
