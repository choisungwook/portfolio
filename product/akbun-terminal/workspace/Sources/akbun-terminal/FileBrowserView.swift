import AppKit
import AkbunTerminalCore

/// The project's files and Git history, on the right of the window.
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
/// and so is the roll up; this file only turns a status into a colour and a
/// letter.
///
/// One click opens a file. It used to take two, and only on markdown, which
/// made a pane full of names that mostly did nothing: a browser beside a
/// terminal is a place to look at a repository, and looking should cost one
/// click. A folder still takes the disclosure triangle or a double click,
/// because opening a folder is not opening a file.
@MainActor
final class FileBrowserView: NSView {
  /// A file was clicked. Folders never arrive here; they open in place.
  var onOpenFile: ((CoreEntry) -> Void)?
  /// Reading a level failed, which is the shell's to report.
  var onError: ((Error) -> Void)?

  private let core: CoreBridge
  private let outline = NSOutlineView()
  private let fileScroll = NSScrollView()
  private let gitTree: GitTreeView
  private let mode = NSButton()
  private let title = NSTextField(labelWithString: "Files")
  private let empty = NSTextField(
    wrappingLabelWithString: "Choose a folder for this project to see its files.")
  private var root: String?
  private var showsGit = false
  /// What git said the last time it was asked, by absolute path. Empty for a
  /// project that is not in a repository, which draws every name plainly.
  private var git: [String: CoreGitEntry] = [:]

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
    self.gitTree = GitTreeView(core: core)
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
    mode.title = "Git"
    mode.image = NSImage(systemSymbolName: "list.bullet", accessibilityDescription: "Show Git Tree")
    mode.imagePosition = .imageLeading
    mode.target = self
    mode.action = #selector(selectPanelMode)
    mode.bezelStyle = .accessoryBarAction
    mode.toolTip = "Show Git Tree"
    let header = NSStackView(views: [title, NSView(), mode, refresh])
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
    // One click opens a file, and is ignored on a folder. The double click is
    // kept for the folder, which is what a person who has just opened one of
    // these panes tries first.
    outline.action = #selector(openClickedFile)
    outline.doubleAction = #selector(openClickedRow)
    outline.menu = rowMenu()
    outline.backgroundColor = .clear

    fileScroll.documentView = outline
    fileScroll.hasVerticalScroller = true
    fileScroll.drawsBackground = false
    fileScroll.translatesAutoresizingMaskIntoConstraints = false
    gitTree.translatesAutoresizingMaskIntoConstraints = false

    empty.translatesAutoresizingMaskIntoConstraints = false
    applyZoom()
    applyPalette()

    addSubview(header)
    addSubview(fileScroll)
    addSubview(gitTree)
    addSubview(empty)
    NSLayoutConstraint.activate([
      header.topAnchor.constraint(equalTo: topAnchor, constant: 12),
      header.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      header.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
      fileScroll.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 10),
      fileScroll.leadingAnchor.constraint(equalTo: leadingAnchor),
      fileScroll.trailingAnchor.constraint(equalTo: trailingAnchor),
      fileScroll.bottomAnchor.constraint(equalTo: bottomAnchor),
      gitTree.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 10),
      gitTree.leadingAnchor.constraint(equalTo: leadingAnchor),
      gitTree.trailingAnchor.constraint(equalTo: trailingAnchor),
      gitTree.bottomAnchor.constraint(equalTo: bottomAnchor),
      empty.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 14),
      empty.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      empty.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
    ])
    showMode()
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
    gitTree.zoom = zoom
  }

  private func applyPalette() {
    layer?.backgroundColor = palette.panel.cgColor
    title.textColor = palette.text
    empty.textColor = palette.secondaryText
    outline.reloadData()
    gitTree.palette = palette
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
    outline.reloadData()
    if showsGit {
      gitTree.show(root: root)
    }
    showMode()
  }

  @objc private func refresh() {
    if showsGit {
      gitTree.refresh()
    } else {
      reload()
    }
  }

  @objc private func selectPanelMode() {
    showsGit.toggle()
    let symbol = showsGit ? "folder" : "list.bullet"
    let help = showsGit ? "Show Files" : "Show Git Tree"
    mode.title = showsGit ? "Files" : "Git"
    mode.image = NSImage(systemSymbolName: symbol, accessibilityDescription: help)
    mode.toolTip = help
    if showsGit {
      gitTree.show(root: root)
    }
    showMode()
  }

  private func showMode() {
    let files = !showsGit
    fileScroll.isHidden = !files || root == nil
    empty.isHidden = !files || root != nil
    gitTree.isHidden = files
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
    if git != before {
      outline.reloadData()
    }
    if !gitTree.isHidden {
      gitTree.refresh()
    }
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

  /// A click below the last row reports -1, which every handler here would
  /// otherwise have to remember.
  private func node(at row: Int) -> Node? {
    guard row >= 0 else { return nil }
    return outline.item(atRow: row) as? Node
  }

  private func rowMenu() -> NSMenu {
    let menu = NSMenu()
    menu.addItem(withTitle: "Reveal in Finder", action: #selector(revealClickedRow), keyEquivalent: "")
      .target = self
    menu.addItem(withTitle: "Copy Path", action: #selector(copyClickedPath), keyEquivalent: "")
      .target = self
    return menu
  }

  /// A single click. Only a file acts on it: a folder would toggle twice when
  /// the click landed on its disclosure triangle, which reads as a folder that
  /// refuses to open.
  @objc private func openClickedFile() {
    guard let node = node(at: outline.clickedRow), !node.entry.isDirectory else { return }
    onOpenFile?(node.entry)
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
    let entry = git[node.entry.path]
    let colour = GitColor.of(entry, in: palette)
    icon.contentTintColor = entry == nil ? palette.secondaryText : colour
    icon.symbolConfiguration = NSImage.SymbolConfiguration(
      pointSize: CGFloat(zoom.size(12)), weight: .regular)
    let label = NSTextField(labelWithString: node.entry.name)
    label.font = .systemFont(ofSize: zoom.size(12))
    label.textColor = colour
    label.lineBreakMode = .byTruncatingMiddle
    // The status is named as well as coloured, because a colour alone cannot be
    // told apart by everyone looking at it.
    label.toolTip =
      entry.map { "\(node.entry.path) — \(GitBadge.describe($0))" } ?? node.entry.path
    var views: [NSView] = [icon, label]
    if let entry {
      // Green and orange are the two halves of git, and the letter is which
      // change it was. Both are on the row, so neither has to carry it alone.
      let badge = NSTextField(labelWithString: GitBadge.of(entry))
      badge.font = .monospacedSystemFont(ofSize: zoom.size(10), weight: .semibold)
      badge.textColor = colour
      badge.toolTip = label.toolTip
      badge.setContentCompressionResistancePriority(.required, for: .horizontal)
      views.append(badge)
    }
    let row = NSStackView(views: views)
    row.orientation = .horizontal
    row.alignment = .centerY
    row.spacing = 5
    return row
  }
}
