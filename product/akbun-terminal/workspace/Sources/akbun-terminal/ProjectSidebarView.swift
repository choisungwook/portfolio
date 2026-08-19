import AppKit
import AkbunTerminalCore

@MainActor
final class ProjectSidebarView: NSView {
  var onChooseFolder: (() -> Void)?
  var onCreateEmptyProject: (() -> Void)?
  var onCreateWorkspace: ((CoreProject) -> Void)?
  var onSelectWorkspace: ((CoreProject, CoreWorkspace) -> Void)?

  private let rows = FlippedStackView()
  private(set) var projects: [CoreProject] = []
  private var selected: UInt64?
  /// What the core judged each workspace to be doing. Kept apart from the tree
  /// because it is what is happening now, not what was saved: a status written
  /// to disk would come back after a restart describing work that is over.
  private var statuses: [UInt64: CoreWorkspaceStatus] = [:]

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    setUp()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setUp()
  }

  private func setUp() {
    wantsLayer = true
    layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor

    let title = NSTextField(labelWithString: "Projects")
    title.font = .systemFont(ofSize: 13, weight: .semibold)

    let add = NSPopUpButton(frame: .zero, pullsDown: true)
    add.bezelStyle = .accessoryBarAction
    add.menu = projectMenu()
    add.menu?.insertItem(withTitle: "", action: nil, keyEquivalent: "", at: 0)
    add.menu?.item(at: 0)?.image = NSImage(systemSymbolName: "plus", accessibilityDescription: "Add project")

    let header = NSStackView(views: [title, NSView(), add])
    header.orientation = .horizontal
    header.alignment = .centerY
    header.translatesAutoresizingMaskIntoConstraints = false

    rows.orientation = .vertical
    rows.alignment = .leading
    rows.spacing = 4
    rows.translatesAutoresizingMaskIntoConstraints = false

    let scroll = NSScrollView()
    scroll.documentView = rows
    scroll.hasVerticalScroller = true
    scroll.drawsBackground = false
    scroll.translatesAutoresizingMaskIntoConstraints = false

    addSubview(header)
    addSubview(scroll)
    NSLayoutConstraint.activate([
      header.topAnchor.constraint(equalTo: topAnchor, constant: 12),
      header.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      header.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
      scroll.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 10),
      scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
      scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
      scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
      rows.widthAnchor.constraint(equalTo: scroll.contentView.widthAnchor),
    ])
  }

  func render(_ state: CoreTreeState) {
    projects = state.projects
    redraw()
  }

  /// Colours one workspace's row. The judging is the core's; this only paints.
  func setStatus(_ status: CoreWorkspaceStatus, for workspace: UInt64) {
    guard statuses[workspace] != status else { return }
    statuses[workspace] = status
    redraw()
  }

  /// Marks a workspace as the one on screen. Selection is drawn here and owned
  /// by the controller, because the terminal it opens is what it really means.
  func select(workspace: UInt64?) {
    guard selected != workspace else { return }
    selected = workspace
    redraw()
  }

  private func redraw() {
    rows.arrangedSubviews.forEach {
      rows.removeArrangedSubview($0)
      $0.removeFromSuperview()
    }
    if projects.isEmpty {
      let empty = NSTextField(wrappingLabelWithString: "Add a folder or create an empty project.")
      empty.textColor = .secondaryLabelColor
      empty.font = .systemFont(ofSize: 12)
      empty.translatesAutoresizingMaskIntoConstraints = false
      rows.addArrangedSubview(empty)
      empty.leadingAnchor.constraint(equalTo: rows.leadingAnchor, constant: 12).isActive = true
      empty.trailingAnchor.constraint(lessThanOrEqualTo: rows.trailingAnchor, constant: -12).isActive = true
      return
    }
    projects.forEach(addProject)
  }

  private func addProject(_ project: CoreProject) {
    let icon = NSImageView(image: NSImage(systemSymbolName: "folder", accessibilityDescription: "Project")!)
    icon.contentTintColor = .secondaryLabelColor
    icon.widthAnchor.constraint(equalToConstant: 14).isActive = true

    let name = NSTextField(labelWithString: project.name)
    name.lineBreakMode = .byTruncatingMiddle
    name.toolTip = project.path ?? "Empty project · home directory"

    let add = ActionButton(symbol: "plus", help: "Add workspace") { [weak self] in
      self?.onCreateWorkspace?(project)
    }
    let row = NSStackView(views: [icon, name, NSView(), add])
    row.orientation = .horizontal
    row.alignment = .centerY
    row.spacing = 5
    row.edgeInsets = NSEdgeInsets(top: 3, left: 8, bottom: 3, right: 6)
    rows.addArrangedSubview(row)
    row.widthAnchor.constraint(equalTo: rows.widthAnchor).isActive = true

    for workspace in project.workspaces {
      let dot = StatusDot(status: statuses[workspace.id] ?? workspace.status)
      let label = NSTextField(labelWithString: workspace.name)
      label.font = .systemFont(ofSize: 12)
      label.lineBreakMode = .byTruncatingTail
      let workspaceRow = WorkspaceRow(isSelected: workspace.id == selected, name: workspace.name) { [weak self] in
        self?.onSelectWorkspace?(project, workspace)
      }
      workspaceRow.setViews([dot, label], in: .leading)
      workspaceRow.orientation = .horizontal
      workspaceRow.alignment = .centerY
      workspaceRow.spacing = 7
      workspaceRow.edgeInsets = NSEdgeInsets(top: 3, left: 31, bottom: 3, right: 8)
      rows.addArrangedSubview(workspaceRow)
      workspaceRow.widthAnchor.constraint(equalTo: rows.widthAnchor).isActive = true
    }
  }

  private func projectMenu() -> NSMenu {
    let menu = NSMenu()
    let folder = menu.addItem(withTitle: "Add Folder…", action: #selector(chooseFolder), keyEquivalent: "")
    folder.target = self
    let empty = menu.addItem(withTitle: "New Empty Project…", action: #selector(createEmptyProject), keyEquivalent: "")
    empty.target = self
    return menu
  }

  @objc private func chooseFolder() {
    onChooseFolder?()
  }

  @objc private func createEmptyProject() {
    onCreateEmptyProject?()
  }
}

private final class ActionButton: NSButton {
  private let handler: () -> Void

  init(symbol: String, help: String, handler: @escaping () -> Void) {
    self.handler = handler
    let image = NSImage(systemSymbolName: symbol, accessibilityDescription: help)!
    super.init(frame: .zero)
    self.image = image
    self.toolTip = help
    self.bezelStyle = .accessoryBarAction
    self.target = self
    self.action = #selector(run)
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  @objc private func run() {
    handler()
  }
}

/// A workspace line. Clicking it is how a terminal is opened, so the row itself
/// is the control rather than a label with a gesture bolted on.
private final class WorkspaceRow: NSStackView {
  private let handler: () -> Void

  init(isSelected: Bool, name: String, handler: @escaping () -> Void) {
    self.handler = handler
    super.init(frame: .zero)
    setAccessibilityElement(true)
    setAccessibilityRole(.button)
    setAccessibilityLabel(name)
    wantsLayer = true
    layer?.cornerRadius = 4
    layer?.backgroundColor =
      (isSelected ? NSColor.selectedContentBackgroundColor : NSColor.clear).cgColor
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  override func mouseDown(with event: NSEvent) {
    handler()
  }

  override func accessibilityPerformPress() -> Bool {
    handler()
    return true
  }
}

private final class FlippedStackView: NSStackView {
  override var isFlipped: Bool { true }
}

private final class StatusDot: NSView {
  init(status: CoreWorkspaceStatus) {
    super.init(frame: NSRect(x: 0, y: 0, width: 8, height: 8))
    wantsLayer = true
    layer?.cornerRadius = 4
    layer?.backgroundColor = Self.color(status).cgColor
    translatesAutoresizingMaskIntoConstraints = false
    widthAnchor.constraint(equalToConstant: 8).isActive = true
    heightAnchor.constraint(equalToConstant: 8).isActive = true
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  private static func color(_ status: CoreWorkspaceStatus) -> NSColor {
    switch status {
    case .idle: .clear
    case .running: .systemOrange
    case .needsAttention: .systemRed
    case .completed: .systemGreen
    case .failed: .systemRed
    }
  }
}
