import AppKit
import MacTaskbarCore

/// Owns the three status items and the section state.
///
/// The hide mechanism is `NSStatusItem.length`. Setting a divider wider than the
/// screen shifts every item to its left past the left edge, where macOS stops
/// drawing status items; setting it back to a narrow width lets them return.
/// Nothing else is involved, and nothing about which icon belongs to which
/// section is stored here. macOS owns status item order and persists it. The
/// user assigns an icon to a section by holding Command and dragging it across
/// a divider, which has to happen in the `all` state because a wide divider
/// occupies off-screen space with nothing to drop onto.
@MainActor
final class SectionController {
  private let control: NSStatusItem
  private let hiddenDivider: NSStatusItem
  private let alwaysHiddenDivider: NSStatusItem

  private(set) var state: Section {
    didSet {
      Defaults.section = state
      onStateChange?(state)
    }
  }

  var onStateChange: ((Section) -> Void)?
  var onContextMenu: (() -> NSMenu)?

  private var autoCollapseTimer: Timer?

  init() {
    let bar = NSStatusBar.system
    // macOS gives each new status item the leftmost free slot, so creation order
    // reads right to left: control first, then the dividers to its left.
    control = bar.statusItem(withLength: NSStatusItem.squareLength)
    hiddenDivider = bar.statusItem(withLength: narrowDividerWidth)
    alwaysHiddenDivider = bar.statusItem(withLength: narrowDividerWidth)

    // Named items keep the position the user dragged them to across launches.
    control.autosaveName = "akbun-mactaskbar-control"
    hiddenDivider.autosaveName = "akbun-mactaskbar-hidden-divider"
    alwaysHiddenDivider.autosaveName = "akbun-mactaskbar-always-hidden-divider"

    state = Defaults.section

    control.button?.target = self
    control.button?.action = #selector(controlClicked)
    control.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])

    apply()
  }

  // MARK: - State

  func cycle() {
    state = state.next
    apply()
  }

  func set(_ newState: Section) {
    guard newState != state else { return }
    state = newState
    apply()
  }

  /// Re-reads the screen and re-applies the current state. Called when the
  /// display arrangement changes, since divider width is derived from it.
  func refreshForScreenChange() { apply() }

  private func apply() {
    let widths = dividerWidths(for: state, screenWidth: currentBarGeometry().screenWidth)
    setDivider(hiddenDivider, width: widths.hidden)
    setDivider(alwaysHiddenDivider, width: widths.alwaysHidden)

    control.button?.image = NSImage(
      systemSymbolName: state.controlSymbol,
      accessibilityDescription: "Menu bar section: \(state.rawValue)"
    )
    control.button?.toolTip = "akbun-mactaskbar: \(state.rawValue)"
    scheduleAutoCollapse()
  }

  private func setDivider(_ item: NSStatusItem, width: CGFloat) {
    item.length = width
    // A wide divider is mostly off screen, and a glyph centred in it would sit
    // somewhere nobody can see. Only the narrow state gets a mark.
    item.button?.image = width > narrowDividerWidth ? nil : Self.dividerImage
    item.button?.toolTip = "akbun-mactaskbar divider"
  }

  /// A hairline, drawn rather than loaded so there is no asset to ship. Template
  /// mode lets AppKit invert it for a light or dark menu bar.
  private static let dividerImage: NSImage = {
    let size = NSSize(width: narrowDividerWidth, height: 14)
    let image = NSImage(size: size, flipped: false) { rect in
      NSColor.black.setFill()
      NSRect(x: rect.midX - 0.5, y: rect.minY + 1, width: 1, height: rect.height - 2).fill()
      return true
    }
    image.isTemplate = true
    return image
  }()

  // MARK: - Auto collapse

  /// Folds the bar back up after a spell of no interaction, so revealing a
  /// section stays a glance rather than a state the user has to remember to
  /// undo. Zero turns it off.
  ///
  /// Only `expanded` folds. `all` is where icons get assigned to sections, by
  /// holding Command and dragging them across a divider, and that takes longer
  /// than any sensible delay. A timer that collapsed the bar mid-drag would
  /// make the one job that needs this state impossible to finish.
  private func scheduleAutoCollapse() {
    autoCollapseTimer?.invalidate()
    autoCollapseTimer = nil

    let delay = Defaults.autoCollapseSeconds
    guard delay > 0, state == .expanded else { return }

    autoCollapseTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
      Task { @MainActor in self?.set(.collapsed) }
    }
  }

  // MARK: - Visibility of the control item

  /// Where the control icon actually sits, or nil before AppKit has placed it.
  var controlItemMinX: CGFloat? { control.button?.window?.frame.minX }

  /// True when the control icon exists but is drawn nowhere.
  ///
  /// macOS hands a new status item the leftmost slot, and on a bar with no room
  /// left that slot is under the camera housing. The app is then running with
  /// its only click target invisible, which is precisely the bar this app is
  /// meant for, so it has to be able to say so rather than look broken.
  var controlIsHidden: Bool {
    guard let x = controlItemMinX else { return false }
    return !currentBarGeometry().isVisible(x: x)
  }

  // MARK: - Clicks

  @objc private func controlClicked() {
    if NSApp.currentEvent?.type == .rightMouseUp, let menu = onContextMenu?() {
      control.menu = menu
      control.button?.performClick(nil)
      control.menu = nil
      return
    }
    cycle()
  }
}
