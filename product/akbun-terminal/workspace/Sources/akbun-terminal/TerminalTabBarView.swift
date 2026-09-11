import AppKit
import AkbunTerminalCore

/// The tab strip above the content for the selected workspace.
///
/// It draws what it is handed and reports clicks. Which tab is active and what
/// happens when one closes is decided by `TerminalTabs`, so the rule is testable
/// and this file stays a view.
@MainActor
final class TerminalTabBarView: NSView {
  var onSelect: ((TerminalTabs.Content) -> Void)?
  var onClose: ((TerminalTabs.Content) -> Void)?
  var onNew: (() -> Void)?

  /// The strip grows with everything else, so a zoomed window does not draw
  /// large text under a strip built for small.
  var zoom = Zoom() {
    didSet {
      guard zoom != oldValue else { return }
      height.constant = isHidden ? 0 : barHeight
      render(tabs: shown, active: activeContent)
    }
  }

  /// Every colour in the window comes from one place, so the strip is part of
  /// the theme rather than a system coloured band above it.
  var palette = Palette.system {
    didSet {
      applyPalette()
      render(tabs: shown, active: activeContent)
    }
  }

  private let row = NSStackView()
  private let divider = NSView()
  private var height: NSLayoutConstraint!
  private var shown: [TerminalTabs.Tab] = []
  private var activeContent: TerminalTabs.Content?
  /// What the core judged each shell to be doing, by session. A tab missing
  /// from this is idle, which is the state that draws nothing.
  private var statuses: [UInt32: CoreWorkspaceStatus] = [:]

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

    divider.wantsLayer = true
    divider.translatesAutoresizingMaskIntoConstraints = false

    wantsLayer = true
    applyPalette()
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
      divider.heightAnchor.constraint(equalToConstant: 1),
    ])
    height = heightAnchor.constraint(equalToConstant: barHeight)
    height.isActive = true
  }

  private func applyPalette() {
    layer?.backgroundColor = palette.panel.cgColor
    divider.layer?.backgroundColor = palette.separator.cgColor
  }

  private var barHeight: CGFloat { CGFloat(zoom.size(32)) }

  /// With no workspace selected there is nothing to add a tab to, so the strip
  /// collapses rather than leaving a "+" that does nothing.
  func show(_ visible: Bool) {
    isHidden = !visible
    height.constant = visible ? barHeight : 0
  }

  /// Paints one shell's judged status on its tab. Per tab rather than per
  /// workspace, because with three agents running the only useful question is
  /// which of them is the one that finished.
  func setStatuses(_ next: [UInt32: CoreWorkspaceStatus]) {
    let merged = statuses.merging(next) { _, new in new }
    guard merged != statuses else { return }
    statuses = merged
    render(tabs: shown, active: activeContent)
  }

  func render(tabs: [TerminalTabs.Tab], active: TerminalTabs.Content?) {
    shown = tabs
    activeContent = active
    // A judgement for a tab that is no longer in the strip is dropped. The core
    // never hands out a session id twice, so this cannot put the wrong mark on a
    // new tab; it is here so the map does not grow for the life of the window.
    //
    // Written as a loop rather than a `compactMap` into a `Set`: Swift 6.2.3's
    // CopyPropagation pass crashes on that spelling of it in a release build,
    // and a debug build says nothing about it.
    var open: Set<UInt32> = []
    for tab in tabs {
      if let session = tab.session {
        open.insert(session)
      }
    }
    var kept: [UInt32: CoreWorkspaceStatus] = [:]
    for (session, status) in statuses where open.contains(session) {
      kept[session] = status
    }
    statuses = kept
    row.arrangedSubviews.forEach {
      row.removeArrangedSubview($0)
      $0.removeFromSuperview()
    }
    for tab in tabs {
      // Read out of the tab before the call rather than inside its argument
      // list, for the same compiler crash the loop above is written around.
      let content = tab.content
      var status = CoreWorkspaceStatus.idle
      if let session = tab.session, let judged = statuses[session] {
        status = judged
      }
      row.addArrangedSubview(
        TabButton(
          tab: tab,
          isActive: content == active,
          status: status,
          zoom: zoom,
          palette: palette,
          select: { [weak self] in self?.onSelect?(content) },
          close: { [weak self] in self?.onClose?(content) }
        ))
    }
    let add = NSButton(
      image: NSImage(systemSymbolName: "plus", accessibilityDescription: "New tab")!,
      target: self, action: #selector(newTab))
    add.bezelStyle = .accessoryBarAction
    add.contentTintColor = palette.secondaryText
    add.toolTip = "New tab"
    row.addArrangedSubview(add)
  }

  @objc private func newTab() {
    onNew?()
  }
}

private final class TabButton: NSView {
  private let select: () -> Void

  init(
    tab: TerminalTabs.Tab, isActive: Bool, status: CoreWorkspaceStatus, zoom: Zoom,
    palette: Palette, select: @escaping () -> Void, close: @escaping () -> Void
  ) {
    self.select = select
    super.init(frame: .zero)
    // The row is the control, so it has to say so itself; VoiceOver has no other
    // way to find a tab drawn as a plain view.
    setAccessibilityElement(true)
    setAccessibilityRole(.button)
    setAccessibilityLabel(tab.title)
    wantsLayer = true
    layer?.cornerRadius = 5
    layer?.backgroundColor = (isActive ? palette.selection : NSColor.clear).cgColor

    // A document and a shell are both tabs, and the icon is what says which one
    // is about to come forward without reading the file name.
    let symbol = tab.documentPath == nil ? "terminal" : "doc.text"
    let icon = NSImageView(image: NSImage(systemSymbolName: symbol, accessibilityDescription: nil)!)
    icon.contentTintColor = isActive ? palette.selectedText : palette.secondaryText

    let label = NSTextField(labelWithString: tab.title)
    label.font = .systemFont(ofSize: zoom.size(12))
    label.textColor = isActive ? palette.selectedText : palette.text

    let closeButton = CloseButton(
      width: zoom.size(14), tint: palette.secondaryText, handler: close)
    var pieces: [NSView] = [icon, label]
    if let mark = StatusMark(status: status, size: zoom.size(12)) {
      setAccessibilityLabel("\(tab.title), \(StatusMark.describe(status))")
      pieces.append(mark)
    }
    pieces.append(closeButton)
    let content = NSStackView(views: pieces)
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

/// The agent icon on a tab: a spinner while it works, a bell once it has
/// finished and nobody has looked, a warning while it waits for an answer.
///
/// Nothing at all when the tab is idle. A row of grey dots on every tab would
/// make the one tab that wants something harder to find rather than easier,
/// which is the only reason the icon exists.
private final class StatusMark: NSView {
  static func describe(_ status: CoreWorkspaceStatus) -> String {
    switch status {
    case .running: "working"
    case .needsAttention: "waiting for an answer"
    case .completed: "finished"
    case .failed: "failed"
    case .idle: "idle"
    }
  }

  init?(status: CoreWorkspaceStatus, size: Double) {
    let symbol: String
    let tint: NSColor
    switch status {
    case .idle:
      return nil
    case .running:
      symbol = "circle.dotted"
      tint = .systemOrange
    case .needsAttention:
      symbol = "exclamationmark.circle.fill"
      tint = .systemRed
    case .completed:
      symbol = "bell.fill"
      tint = .systemGreen
    case .failed:
      symbol = "xmark.circle.fill"
      tint = .systemRed
    }
    super.init(frame: .zero)
    let side = CGFloat(size)
    let image = NSImageView(
      image: NSImage(systemSymbolName: symbol, accessibilityDescription: Self.describe(status))!)
    image.contentTintColor = tint
    image.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: side, weight: .regular)
    image.translatesAutoresizingMaskIntoConstraints = false
    addSubview(image)
    translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      image.centerXAnchor.constraint(equalTo: centerXAnchor),
      image.centerYAnchor.constraint(equalTo: centerYAnchor),
      widthAnchor.constraint(equalToConstant: side + 4),
    ])
    if status == .running {
      spin()
    }
  }

  /// The spinner turns, because a still icon and a working agent look the same
  /// from across a desk. One layer animation rather than an NSProgressIndicator:
  /// the indicator brings its own sizing and its own colour and neither follows
  /// the theme.
  private func spin() {
    wantsLayer = true
    let turn = CABasicAnimation(keyPath: "transform.rotation.z")
    turn.fromValue = 0
    turn.toValue = -Double.pi * 2
    turn.duration = 1.6
    turn.repeatCount = .infinity
    layer?.add(turn, forKey: "spin")
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }
}

private final class CloseButton: NSButton {
  private let handler: () -> Void

  init(width: Double, tint: NSColor, handler: @escaping () -> Void) {
    self.handler = handler
    super.init(frame: .zero)
    image = NSImage(systemSymbolName: "xmark", accessibilityDescription: "Close tab")!
    contentTintColor = tint
    imageScaling = .scaleProportionallyDown
    isBordered = false
    toolTip = "Close tab"
    target = self
    action = #selector(run)
    widthAnchor.constraint(equalToConstant: CGFloat(width)).isActive = true
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  @objc private func run() {
    handler()
  }
}
