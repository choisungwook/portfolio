import AppKit
import AkbunTerminalCore

/// The project's files, on the right of the window.
///
/// An outline view is used because opening a row is exactly when its contents
/// should be read, and that is the moment `numberOfChildrenOfItem` is called.
/// Nothing is read until then, so a folder with a dependency directory in it
/// costs nothing until someone opens it.
@MainActor
final class FileBrowserView: NSView {
  /// A markdown file was double clicked.
  var onOpenFile: ((CoreEntry) -> Void)?
  /// Reading a level failed, which is the shell's to report.
  var onError: ((Error) -> Void)?

  private let core: CoreBridge
  private let outline = NSOutlineView()
  private let title = NSTextField(labelWithString: "Files")
  private let empty = NSTextField(
    wrappingLabelWithString: "Choose a folder for this project to see its files.")
  private var root: String?
  private var children: [String: [Node]] = [:]

  /// One row. A reference type because the outline view holds on to items by
  /// identity, and a struct copied into it would never match on refresh.
  private final class Node {
    let entry: CoreEntry
    var loaded: [Node]?
    init(_ entry: CoreEntry) { self.entry = entry }
  }

  private var roots: [Node] = []

  init(core: CoreBridge) {
    self.core = core
    super.init(frame: .zero)
    setUp()
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  private func setUp() {
    wantsLayer = true
    layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor

    title.font = .systemFont(ofSize: 13, weight: .semibold)
    let refresh = NSButton(
      image: NSImage(systemSymbolName: "arrow.clockwise", accessibilityDescription: "Refresh")!,
      target: self, action: #selector(refresh))
    refresh.bezelStyle = .accessoryBarAction
    refresh.toolTip = "Refresh"
    let header = NSStackView(views: [title, NSView(), refresh])
    header.orientation = .horizontal
    header.alignment = .centerY
    header.translatesAutoresizingMaskIntoConstraints = false

    let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("file"))
    column.resizingMask = .autoresizingMask
    outline.addTableColumn(column)
    outline.outlineTableColumn = column
    outline.headerView = nil
    outline.rowSizeStyle = .small
    outline.indentationPerLevel = 13
    outline.dataSource = self
    outline.delegate = self
    outline.target = self
    outline.doubleAction = #selector(openClickedRow)
    outline.menu = rowMenu()
    outline.backgroundColor = .clear

    let scroll = NSScrollView()
    scroll.documentView = outline
    scroll.hasVerticalScroller = true
    scroll.drawsBackground = false
    scroll.translatesAutoresizingMaskIntoConstraints = false

    empty.textColor = .secondaryLabelColor
    empty.font = .systemFont(ofSize: 12)
    empty.translatesAutoresizingMaskIntoConstraints = false

    addSubview(header)
    addSubview(scroll)
    addSubview(empty)
    NSLayoutConstraint.activate([
      header.topAnchor.constraint(equalTo: topAnchor, constant: 12),
      header.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      header.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
      scroll.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 10),
      scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
      scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
      scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
      empty.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 14),
      empty.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      empty.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
    ])
  }

  /// Points the browser at a project. A project with no folder shows the notice
  /// and an empty tree rather than the previous project's files.
  func show(project: CoreProject?) {
    title.stringValue = project?.name ?? "Files"
    root = project?.path
    reload()
  }

  private func reload() {
    children.removeAll()
    roots = root.map(read) ?? []
    empty.isHidden = root != nil
    outline.enclosingScrollView?.isHidden = root == nil
    outline.reloadData()
  }

  @objc private func refresh() {
    reload()
  }

  private func read(_ path: String) -> [Node] {
    do {
      return try core.entries(in: path).map(Node.init)
    } catch {
      onError?(error)
      return []
    }
  }

  private func node(at row: Int) -> Node? {
    outline.item(atRow: row) as? Node
  }

  private func rowMenu() -> NSMenu {
    let menu = NSMenu()
    menu.addItem(withTitle: "Reveal in Finder", action: #selector(revealClickedRow), keyEquivalent: "")
      .target = self
    menu.addItem(withTitle: "Copy Path", action: #selector(copyClickedPath), keyEquivalent: "")
      .target = self
    return menu
  }

  @objc private func openClickedRow() {
    guard let node = node(at: outline.clickedRow) else { return }
    guard !node.entry.isDirectory else {
      if outline.isItemExpanded(node) {
        outline.collapseItem(node)
      } else {
        outline.expandItem(node)
      }
      return
    }
    onOpenFile?(node.entry)
  }

  @objc private func revealClickedRow() {
    guard let node = node(at: outline.clickedRow) else { return }
    NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: node.entry.path)])
  }

  @objc private func copyClickedPath() {
    guard let node = node(at: outline.clickedRow) else { return }
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(node.entry.path, forType: .string)
  }
}

extension FileBrowserView: NSOutlineViewDataSource {
  func outlineView(_ outlineView: NSOutlineView, numberOfChildrenOfItem item: Any?) -> Int {
    guard let node = item as? Node else { return roots.count }
    guard node.entry.isDirectory else { return 0 }
    // The read happens here, on the way to drawing the row that was opened.
    if node.loaded == nil {
      node.loaded = read(node.entry.path)
    }
    return node.loaded?.count ?? 0
  }

  func outlineView(_ outlineView: NSOutlineView, child index: Int, ofItem item: Any?) -> Any {
    guard let node = item as? Node else { return roots[index] }
    return node.loaded?[index] ?? Node(node.entry)
  }

  func outlineView(_ outlineView: NSOutlineView, isItemExpandable item: Any) -> Bool {
    (item as? Node)?.entry.isDirectory ?? false
  }
}

extension FileBrowserView: NSOutlineViewDelegate {
  func outlineView(_ outlineView: NSOutlineView, viewFor tableColumn: NSTableColumn?, item: Any)
    -> NSView?
  {
    guard let node = item as? Node else { return nil }
    let symbol = node.entry.isDirectory ? "folder" : "doc.text"
    let icon = NSImageView(image: NSImage(systemSymbolName: symbol, accessibilityDescription: nil)!)
    icon.contentTintColor = .secondaryLabelColor
    let label = NSTextField(labelWithString: node.entry.name)
    label.font = .systemFont(ofSize: 12)
    label.lineBreakMode = .byTruncatingMiddle
    label.toolTip = node.entry.path
    let row = NSStackView(views: [icon, label])
    row.orientation = .horizontal
    row.alignment = .centerY
    row.spacing = 5
    return row
  }
}
