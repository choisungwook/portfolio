import Foundation

/// Section state machine. No AppKit, so the mapping from state to divider width
/// is unit tested without launching the app.
///
/// The menu bar is split into three sections by two divider status items that
/// this app owns. Laid out left to right the bar looks like this:
///
///     [always-hidden items] [AH divider] [hidden items] [H divider] [visible items] [control]
///
/// A divider is a status item whose width this app sets. Widening one past the
/// screen width shifts everything to its left off the left edge, where macOS
/// stops drawing status items. Narrowing it lets them slide back.
///
/// Cycling the three states is what answers "too many icons": the bar is paged
/// one section at a time instead of scrolled.
public enum Section: String, CaseIterable, Sendable {
  case collapsed
  case expanded
  case all

  public var next: Section {
    let order = Section.allCases
    let index = order.firstIndex(of: self) ?? 0
    return order[(index + 1) % order.count]
  }

  /// SF Symbol shown on the control item. The arrow points at what a click does:
  /// reveal what sits to the left, or fold it all back up.
  public var controlSymbol: String {
    switch self {
    case .collapsed: "chevron.left"
    case .expanded: "chevron.left.2"
    case .all: "chevron.right"
    }
  }

  /// Whether the divider left of each section is wide, which is to say the
  /// section it guards is off screen.
  public var hiddenDividerIsWide: Bool { self == .collapsed }
  public var alwaysHiddenDividerIsWide: Bool { self != .all }
}

/// Width of both dividers for a state.
public struct DividerWidths: Equatable, Sendable {
  public let hidden: CGFloat
  public let alwaysHidden: CGFloat

  public init(hidden: CGFloat, alwaysHidden: CGFloat) {
    self.hidden = hidden
    self.alwaysHidden = alwaysHidden
  }
}

/// Narrow enough not to waste a slot on a bar that is already short of room,
/// wide enough to stay a Command-drag target.
public let narrowDividerWidth: CGFloat = 12

/// A wide divider has to shift a full bar of icons past the left edge, so one
/// screen width of travel is the floor. The extra screen width is headroom for
/// a bar whose items already start left of the origin.
public func wideDividerWidth(screenWidth: CGFloat) -> CGFloat {
  max(screenWidth * 2, 2000)
}

public func dividerWidths(for state: Section, screenWidth: CGFloat) -> DividerWidths {
  let wide = wideDividerWidth(screenWidth: screenWidth)
  return DividerWidths(
    hidden: state.hiddenDividerIsWide ? wide : narrowDividerWidth,
    alwaysHidden: state.alwaysHiddenDividerIsWide ? wide : narrowDividerWidth
  )
}
