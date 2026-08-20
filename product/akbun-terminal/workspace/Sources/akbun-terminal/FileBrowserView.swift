import AppKit
import AkbunTerminalCore

/// The project's files, on the right of the window.
///
/// An outline view is used because opening a row is exactly when its contents
/// should be read, and that is the moment `numberOfChildrenOfItem` is called.
/// Nothing is read until then, so a folder with a dependency directory in it
/// costs nothing until someone opens it.
///
/// Hidden files and folders are listed, because the folders this opens are
/// repositories and .github, .claude and .gitignore are the files people go
/// looking for. The rule itself is in the core, so the browser and anything
/// else that reads a folder agree about what is in it.
///
/// Names are coloured by what git makes of them, which is why the folders that
/// were worth opening are now visible without opening them: a closed folder
/// wears the strongest status of anything inside it. The judging is the core's
/// and so is the roll up; this file only turns a status into a colour.
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
  /// What git said the last time it was asked, by absolute path. Empty for a
  /// project that is not in a repository, which draws every name plainly.
  private var git: [String: CoreFileStatus] = [:]

  /// Everything in the window is one size, so the browser follows the terminal.
  var zoom = Zoom() {
    didSet {
      guard zoom != oldValue else { return }
      applyZoom()
    }
  }

  /// Every colour in the window comes from one place, so a dark theme does not
  /// leave a light file list beside a dark terminal.
  var palette = Palette.system {
    didSet { applyPalette() }
  }

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
    outline.rowSizeStyle = .custom
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

    empty.translatesAutoresizingMaskIntoConstraints = false
    applyZoom()
    applyPalette()

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

  /// Row heights and indentation are set here rather than left to the outline
  /// view's own small style, because that style is a fixed size and a fixed size
  /// clips the text as soon as the window is zoomed in.
  private func applyZoom() {
    title.font = .systemFont(ofSize: zoom.size(13), weight: .semibold)
    empty.font = .systemFont(ofSize: zoom.size(12))
    outline.rowHeight = CGFloat(zoom.size(18))
    outline.indentationPerLevel = CGFloat(zoom.size(13))
    outline.reloadData()
  }

  private func applyPalette() {
    layer?.backgroundColor = palette.panel.cgColor
    title.textColor = palette.text
    empty.textColor = palette.secondaryText
    outline.reloadData()
  }

  /// Points the browser at a project. A project with no folder shows the notice
  /// and an empty tree rather than the previous project's files.
  func show(project: CoreProject?) {
    title.stringValue = project?.name ?? "Files"
    root = project?.path
    reload()
  }

  private func reload() {
    readGitStatus()
    roots = root.map(read) ?? []
    empty.isHidden = root != nil
    outline.enclosingScrollView?.isHidden = root == nil
    outline.reloadData()
  }

  @objc private func refresh() {
    reload()
  }

  /// Asks git again and repaints, without reading a single directory.
  ///
  /// Separate from `reload` because these two change on different clocks: what
  /// is in a folder changes when someone adds a file, and what git makes of it
  /// changes on every save. Rebuilding the tree on that second clock would
  /// close every folder the reader had opened.
  func refreshGitStatus() {
    let before = git
    readGitStatus()
    guard git != before else { return }
    outline.reloadData()
  }

  private func readGitStatus() {
    git = root.map { core.gitStatus(in: $0).byPath } ?? [:]
  }

  /// The children of a folder, read the first time they are asked for. Both
  /// data source calls go through here, so neither can see a half filled node.
  private func children(of node: Node) -> [Node] {
    guard node.entry.isDirectory else { return [] }
    if node.loaded == nil {
      node.loaded = read(node.entry.path)
    }
    return node.loaded ?? []
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
    // The read happens here, on the way to drawing the row that was opened.
    return children(of: node).count
  }

  func outlineView(_ outlineView: NSOutlineView, child index: Int, ofItem item: Any?) -> Any {
    guard let node = item as? Node else { return roots[index] }
    return children(of: node)[index]
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
    let status = git[node.entry.path]
    let colour = GitColor.of(status, in: palette)
    icon.contentTintColor = status == nil ? palette.secondaryText : colour
    icon.symbolConfiguration = NSImage.SymbolConfiguration(
      pointSize: CGFloat(zoom.size(12)), weight: .regular)
    let label = NSTextField(labelWithString: node.entry.name)
    label.font = .systemFont(ofSize: zoom.size(12))
    label.textColor = colour
    label.lineBreakMode = .byTruncatingMiddle
    // The status is named as well as coloured, because a colour alone cannot be
    // told apart by everyone looking at it.
    label.toolTip = status.map { "\(node.entry.path) — \($0.rawValue)" } ?? node.entry.path
    let row = NSStackView(views: [icon, label])
    row.orientation = .horizontal
    row.alignment = .centerY
    row.spacing = 5
    return row
  }
}
