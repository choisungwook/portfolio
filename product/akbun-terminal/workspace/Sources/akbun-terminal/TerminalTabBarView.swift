import AppKit
import AkbunTerminalCore

/// The tab strip above the terminal for the selected workspace.
///
/// It draws what it is handed and reports clicks. Which tab is active and what
/// happens when one closes is decided by `TerminalTabs`, so the rule is testable
/// and this file stays a view.
@MainActor
final class TerminalTabBarView: NSView {
  var onSelect: ((UInt32) -> Void)?
  var onClose: ((UInt32) -> Void)?
  var onNew: (() -> Void)?

  private let row = NSStackView()
  private var height: NSLayoutConstraint!

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    setUp()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setUp()
  }

  private func setUp() {
    row.orientation = .horizontal
    row.alignment = .centerY
    row.spacing = 4
    row.translatesAutoresizingMaskIntoConstraints = false

    let divider = NSBox()
    divider.boxType = .separator
    divider.translatesAutoresizingMaskIntoConstraints = false

    addSubview(row)
    addSubview(divider)
    NSLayoutConstraint.activate([
      row.topAnchor.constraint(equalTo: topAnchor, constant: 4),
      row.bottomAnchor.constraint(equalTo: divider.topAnchor, constant: -4),
      row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
      row.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -8),
      divider.leadingAnchor.constraint(equalTo: leadingAnchor),
      divider.trailingAnchor.constraint(equalTo: trailingAnchor),
      divider.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
    height = heightAnchor.constraint(equalToConstant: 32)
    height.isActive = true
  }

  /// With no workspace selected there is nothing to add a tab to, so the strip
  /// collapses rather than leaving a "+" that does nothing.
  func show(_ visible: Bool) {
    isHidden = !visible
    height.constant = visible ? 32 : 0
  }

  func render(tabs: [TerminalTabs.Tab], active: UInt32?) {
    row.arrangedSubviews.forEach {
      row.removeArrangedSubview($0)
      $0.removeFromSuperview()
    }
    for tab in tabs {
      row.addArrangedSubview(
        TabButton(
          tab: tab,
          isActive: tab.session == active,
          select: { [weak self] in self?.onSelect?(tab.session) },
          close: { [weak self] in self?.onClose?(tab.session) }
        ))
    }
    let add = NSButton(
      image: NSImage(systemSymbolName: "plus", accessibilityDescription: "New tab")!,
      target: self, action: #selector(newTab))
    add.bezelStyle = .accessoryBarAction
    add.toolTip = "New tab"
    row.addArrangedSubview(add)
  }

  @objc private func newTab() {
    onNew?()
  }
}

private final class TabButton: NSView {
  private let select: () -> Void

  init(tab: TerminalTabs.Tab, isActive: Bool, select: @escaping () -> Void, close: @escaping () -> Void) {
    self.select = select
    super.init(frame: .zero)
    // The row is the control, so it has to say so itself; VoiceOver has no other
    // way to find a tab drawn as a plain view.
    setAccessibilityElement(true)
    setAccessibilityRole(.button)
    setAccessibilityLabel(tab.title)
    wantsLayer = true
    layer?.cornerRadius = 5
    layer?.backgroundColor =
      (isActive ? NSColor.selectedContentBackgroundColor : NSColor.clear).cgColor

    let label = NSTextField(labelWithString: tab.title)
    label.font = .systemFont(ofSize: 12)
    label.textColor = isActive ? .selectedMenuItemTextColor : .labelColor

    let closeButton = CloseButton(handler: close)
    let content = NSStackView(views: [label, closeButton])
    content.orientation = .horizontal
    content.alignment = .centerY
    content.spacing = 4
    content.edgeInsets = NSEdgeInsets(top: 3, left: 9, bottom: 3, right: 5)
    content.translatesAutoresizingMaskIntoConstraints = false
    addSubview(content)
    NSLayoutConstraint.activate([
      content.topAnchor.constraint(equalTo: topAnchor),
      content.bottomAnchor.constraint(equalTo: bottomAnchor),
      content.leadingAnchor.constraint(equalTo: leadingAnchor),
      content.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  override func mouseDown(with event: NSEvent) {
    select()
  }

  override func accessibilityPerformPress() -> Bool {
    select()
    return true
  }
}

private final class CloseButton: NSButton {
  private let handler: () -> Void

  init(handler: @escaping () -> Void) {
    self.handler = handler
    super.init(frame: .zero)
    image = NSImage(systemSymbolName: "xmark", accessibilityDescription: "Close tab")!
    imageScaling = .scaleProportionallyDown
    isBordered = false
    toolTip = "Close tab"
    target = self
    action = #selector(run)
    widthAnchor.constraint(equalToConstant: 14).isActive = true
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  @objc private func run() {
    handler()
  }
}
