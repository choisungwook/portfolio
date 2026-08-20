import AppKit
import AkbunTerminalCore

@MainActor
final class ProjectSidebarView: NSView {
  var onChooseFolder: (() -> Void)?
  var onCreateEmptyProject: (() -> Void)?
  var onCreateWorkspace: ((CoreProject) -> Void)?
  var onSelectWorkspace: ((CoreProject, CoreWorkspace) -> Void)?
  var onRenameProject: ((CoreProject) -> Void)?
  var onDeleteProject: ((CoreProject) -> Void)?
  var onRenameWorkspace: ((CoreProject, CoreWorkspace) -> Void)?
  var onDeleteWorkspace: ((CoreProject, CoreWorkspace) -> Void)?

  private let rows = FlippedStackView()
  private(set) var projects: [CoreProject] = []
  private var selected: UInt64?
  /// What the core judged each workspace to be doing. Kept apart from the tree
  /// because it is what is happening now, not what was saved: a status written
  /// to disk would come back after a restart describing work that is over.
  private var statuses: [UInt64: CoreWorkspaceStatus] = [:]
  /// Everything in the window is one size, so the tree follows the terminal.
  var zoom = Zoom() {
    didSet {
      guard zoom != oldValue else { return }
      title.font = .systemFont(ofSize: zoom.size(13), weight: .semibold)
      redraw()
    }
  }

  /// Every colour in the window comes from one place, so a dark theme does not
  /// leave a light list beside a dark terminal.
  var palette = Palette.system {
    didSet { redraw() }
  }

  private let title = NSTextField(labelWithString: "Projects")

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

    title.font = .systemFont(ofSize: zoom.size(13), weight: .semibold)

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
    rows.spacing = rowSpacing
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
    redraw()
  }

  /// How far apart the rows sit, and how tall each one is.
  ///
  /// These were four points of spacing and three of padding, which packed the
  /// projects and their workspaces into a block that had to be read carefully to
  /// see where one project ended. The list is short — a handful of projects with
  /// a few workspaces each — so there is room to give every row the height it
  /// takes to be picked out at a glance. Both follow the zoom, or a zoomed in
  /// window would grow the text inside rows that stayed the old height.
  private var rowSpacing: CGFloat { CGFloat(zoom.size(6)) }
  private var projectPadding: CGFloat { CGFloat(zoom.size(8)) }
  private var workspacePadding: CGFloat { CGFloat(zoom.size(6)) }

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
    layer?.backgroundColor = palette.panel.cgColor
    title.textColor = palette.text
    rows.spacing = rowSpacing
    rows.arrangedSubviews.forEach {
      rows.removeArrangedSubview($0)
      $0.removeFromSuperview()
    }
    if projects.isEmpty {
      let empty = NSTextField(wrappingLabelWithString: "Add a folder or create an empty project.")
      empty.textColor = palette.secondaryText
      empty.font = .systemFont(ofSize: zoom.size(12))
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
    icon.contentTintColor = palette.secondaryText
    icon.symbolConfiguration = NSImage.SymbolConfiguration(
      pointSize: CGFloat(zoom.size(12)), weight: .regular)
    icon.widthAnchor.constraint(equalToConstant: CGFloat(zoom.size(14))).isActive = true

    let name = NSTextField(labelWithString: project.name)
    name.font = .systemFont(ofSize: zoom.size(13))
    name.textColor = palette.text
    name.lineBreakMode = .byTruncatingMiddle
    name.toolTip = project.path ?? "Empty project · home directory"

    let add = ActionButton(symbol: "plus", help: "Add workspace", tint: palette.secondaryText) {
      [weak self] in self?.onCreateWorkspace?(project)
    }
    let rename = ActionButton(
      symbol: "pencil", help: "Rename project", tint: palette.secondaryText
    ) { [weak self] in self?.onRenameProject?(project) }
    let delete = ActionButton(symbol: "trash", help: "Delete project", tint: palette.secondaryText) {
      [weak self] in self?.onDeleteProject?(project)
    }
    let row = NSStackView(views: [icon, name, NSView(), add, rename, delete])
    row.orientation = .horizontal
    row.alignment = .centerY
    row.spacing = 5
    row.edgeInsets = NSEdgeInsets(top: projectPadding, left: 8, bottom: projectPadding, right: 6)
    rows.addArrangedSubview(row)
    row.widthAnchor.constraint(equalTo: rows.widthAnchor).isActive = true

    for workspace in project.workspaces {
      addWorkspace(workspace, of: project)
    }
  }

  private func addWorkspace(_ workspace: CoreWorkspace, of project: CoreProject) {
    let isSelected = workspace.id == selected
    let dot = StatusDot(status: statuses[workspace.id] ?? workspace.status, size: zoom.size(8))
    let label = NSTextField(labelWithString: workspace.name)
    label.font = .systemFont(ofSize: zoom.size(12))
    label.textColor = isSelected ? palette.selectedText : palette.text
    label.lineBreakMode = .byTruncatingTail
    let rename = ActionButton(
      symbol: "pencil", help: "Rename workspace", tint: palette.secondaryText
    ) { [weak self] in self?.onRenameWorkspace?(project, workspace) }
    let delete = ActionButton(
      symbol: "trash", help: "Delete workspace", tint: palette.secondaryText
    ) { [weak self] in self?.onDeleteWorkspace?(project, workspace) }
    let row = WorkspaceRow(
      isSelected: isSelected, name: workspace.name, selection: palette.selection
    ) { [weak self] in self?.onSelectWorkspace?(project, workspace) }
    row.setViews([dot, label, NSView(), rename, delete], in: .leading)
    row.orientation = .horizontal
    row.alignment = .centerY
    row.spacing = 7
    row.edgeInsets = NSEdgeInsets(
      top: workspacePadding, left: CGFloat(zoom.size(31)), bottom: workspacePadding, right: 6)
    rows.addArrangedSubview(row)
    row.widthAnchor.constraint(equalTo: rows.widthAnchor).isActive = true
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

  init(symbol: String, help: String, tint: NSColor, handler: @escaping () -> Void) {
    self.handler = handler
    let image = NSImage(systemSymbolName: symbol, accessibilityDescription: help)!
    super.init(frame: .zero)
    self.image = image
    self.toolTip = help
    self.bezelStyle = .accessoryBarAction
    self.contentTintColor = tint
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
/// is the control rather than a label with a gesture bolted on. The buttons on
/// it answer their own clicks, so they never open the terminal on the way to
/// renaming or deleting it.
private final class WorkspaceRow: NSStackView {
  private let handler: () -> Void

  init(isSelected: Bool, name: String, selection: NSColor, handler: @escaping () -> Void) {
    self.handler = handler
    super.init(frame: .zero)
    setAccessibilityElement(true)
    setAccessibilityRole(.button)
    setAccessibilityLabel(name)
    wantsLayer = true
    layer?.cornerRadius = 4
    layer?.backgroundColor = (isSelected ? selection : NSColor.clear).cgColor
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
  init(status: CoreWorkspaceStatus, size: Double) {
    let side = CGFloat(size)
    super.init(frame: NSRect(x: 0, y: 0, width: side, height: side))
    wantsLayer = true
    layer?.cornerRadius = side / 2
    layer?.backgroundColor = Self.color(status).cgColor
    translatesAutoresizingMaskIntoConstraints = false
    widthAnchor.constraint(equalToConstant: side).isActive = true
    heightAnchor.constraint(equalToConstant: side).isActive = true
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
