import AppKit
import AkbunTerminalCore

/// What is waiting in the repository right now: the index, the working tree and
/// the stash, in that order.
///
/// The file browser already colours names by what git makes of them, but a
/// colour spread over a tree cannot answer "what would a commit take". That is
/// a list, and it is three lists: what is staged, what is not, and what was put
/// aside. The stash is here because it is the one part of a repository nothing
/// else in this window can show at all.
///
/// Nothing here writes to the repository. Staging from a pane beside a terminal
/// would be a second way to do what the terminal already does, and the two
/// could disagree about what happened; this pane says what is there and the
/// shell in the middle of the window is where it is changed.
@MainActor
final class GitStatusPanelView: NSView, NSOutlineViewDataSource, NSOutlineViewDelegate {
  /// A file row was clicked. Carries the absolute path.
  var onOpenFile: ((String) -> Void)?

  private let core: CoreBridge
  private let outline = NSOutlineView()
  private let scroll = NSScrollView()
  private let empty = NSTextField(wrappingLabelWithString: "")
  private var root: String?
  private var working = CoreGitWorking.none

  var zoom = Zoom() {
    didSet {
      guard zoom != oldValue else { return }
      applyZoom()
    }
  }

  var palette = Palette.system {
    didSet { applyPalette() }
  }

  /// One row. A reference type because the outline view holds its items by
  /// identity, and the sections have to survive a reload to stay open.
  private final class Section {
    let title: String
    var rows: [Row] = []
    init(_ title: String) { self.title = title }
  }

  private final class Row {
    /// The file, or nothing for a stash row.
    let entry: CoreGitEntry?
    let stash: CoreGitStashEntry?
    init(entry: CoreGitEntry) {
      self.entry = entry
      self.stash = nil
    }
    init(stash: CoreGitStashEntry) {
      self.entry = nil
      self.stash = stash
    }
  }

  private let staged = Section("Staged")
  private let unstaged = Section("Not staged")
  private let stash = Section("Stash")
  private var sections: [Section] { [staged, unstaged, stash] }

  init(core: CoreBridge) {
    self.core = core
    super.init(frame: .zero)
    setUp()
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  private func setUp() {
    let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("change"))
    column.resizingMask = .autoresizingMask
    outline.addTableColumn(column)
    outline.outlineTableColumn = column
    outline.headerView = nil
    outline.rowSizeStyle = .custom
    outline.dataSource = self
    outline.delegate = self
    outline.target = self
    outline.action = #selector(openClickedRow)
    outline.menu = rowMenu()
    outline.backgroundColor = .clear
    outline.floatsGroupRows = false

    scroll.documentView = outline
    scroll.hasVerticalScroller = true
    scroll.drawsBackground = false
    scroll.translatesAutoresizingMaskIntoConstraints = false
    empty.translatesAutoresizingMaskIntoConstraints = false
    addSubview(scroll)
    addSubview(empty)
    NSLayoutConstraint.activate([
      scroll.topAnchor.constraint(equalTo: topAnchor),
      scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
      scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
      scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
      empty.topAnchor.constraint(equalTo: topAnchor, constant: 4),
      empty.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      empty.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
    ])
    applyZoom()
    applyPalette()
    updateVisibility()
  }

  func show(root: String?) {
    self.root = root
    refresh()
  }

  /// Asks git again and redraws only when something moved. This runs on the
  /// window's git timer, and reloading on every tick would collapse the
  /// sections under whoever is reading them.
  func refresh() {
    let next = root.map(core.gitWorking) ?? .none
    let changed = next != working
    working = next
    updateVisibility()
    guard changed else { return }
    staged.rows = working.staged.map(Row.init(entry:))
    unstaged.rows = working.unstaged.map(Row.init(entry:))
    stash.rows = working.stash.map(Row.init(stash:))
    outline.reloadData()
    for section in sections where !section.rows.isEmpty {
      outline.expandItem(section)
    }
  }

  private func updateVisibility() {
    let message: String?
    if root == nil {
      message = "Choose a folder for this project to see what is waiting in it."
    } else if !working.repository {
      message = "Git status is unavailable for this folder."
    } else if working.isEmpty {
      message = "Nothing staged, nothing changed, nothing stashed."
    } else {
      message = nil
    }
    empty.stringValue = message ?? ""
    empty.isHidden = message == nil
    scroll.isHidden = message != nil
  }

  private func applyZoom() {
    empty.font = .systemFont(ofSize: zoom.size(12))
    outline.rowHeight = CGFloat(zoom.size(18))
    outline.indentationPerLevel = CGFloat(zoom.size(13))
    outline.reloadData()
  }

  private func applyPalette() {
    empty.textColor = palette.secondaryText
    outline.reloadData()
  }

  private func rowMenu() -> NSMenu {
    let menu = NSMenu()
    menu.addItem(
      withTitle: "Reveal in Finder", action: #selector(revealClickedRow), keyEquivalent: ""
    ).target = self
    menu.addItem(
      withTitle: "Copy Path", action: #selector(copyClickedPath), keyEquivalent: ""
    ).target = self
    return menu
  }

  private func path(at row: Int) -> String? {
    guard row >= 0 else { return nil }
    return (outline.item(atRow: row) as? Row)?.entry?.path
  }

  @objc private func openClickedRow() {
    // A deleted file has nothing left to open, and a stash row is not a file.
    guard let row = outline.item(atRow: outline.clickedRow) as? Row, let entry = row.entry,
      entry.status != .deleted
    else { return }
    onOpenFile?(entry.path)
  }

  @objc private func revealClickedRow() {
    guard let path = path(at: outline.clickedRow) else { return }
    NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
  }

  @objc private func copyClickedPath() {
    guard let path = path(at: outline.clickedRow) else { return }
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(path, forType: .string)
  }

  /// The path as the repository spells it, which is what a reader recognises.
  /// An absolute path is what the row carries, and most of it is the same for
  /// every row in the pane.
  private func relative(_ path: String) -> String {
    guard let root, path.hasPrefix(root) else { return path }
    return String(path.dropFirst(root.count).drop(while: { $0 == "/" }))
  }

  func outlineView(_ outlineView: NSOutlineView, numberOfChildrenOfItem item: Any?) -> Int {
    guard let section = item as? Section else { return sections.count }
    return section.rows.count
  }

  func outlineView(_ outlineView: NSOutlineView, child index: Int, ofItem item: Any?) -> Any {
    guard let section = item as? Section else { return sections[index] }
    return section.rows[index]
  }

  func outlineView(_ outlineView: NSOutlineView, isItemExpandable item: Any) -> Bool {
    item is Section
  }

  func outlineView(_ outlineView: NSOutlineView, isGroupItem item: Any) -> Bool {
    item is Section
  }

  func outlineView(_ outlineView: NSOutlineView, shouldSelectItem item: Any) -> Bool {
    item is Row
  }

  func outlineView(_ outlineView: NSOutlineView, viewFor tableColumn: NSTableColumn?, item: Any)
    -> NSView?
  {
    if let section = item as? Section {
      let label = NSTextField(labelWithString: "\(section.title) (\(section.rows.count))")
      label.font = .systemFont(ofSize: zoom.size(11), weight: .semibold)
      label.textColor = palette.secondaryText
      return label
    }
    guard let row = item as? Row else { return nil }
    if let stash = row.stash {
      let name = NSTextField(labelWithString: stash.name)
      name.font = .monospacedSystemFont(ofSize: zoom.size(10), weight: .semibold)
      name.textColor = palette.accent
      name.setContentCompressionResistancePriority(.required, for: .horizontal)
      let subject = NSTextField(labelWithString: stash.subject)
      subject.font = .systemFont(ofSize: zoom.size(11))
      subject.textColor = palette.text
      subject.lineBreakMode = .byTruncatingTail
      return line(of: [name, subject], tooltip: "\(stash.name) — \(stash.subject)")
    }
    guard let entry = row.entry else { return nil }
    let colour = GitColor.of(entry, in: palette)
    let badge = NSTextField(labelWithString: GitBadge.of(entry))
    badge.font = .monospacedSystemFont(ofSize: zoom.size(10), weight: .semibold)
    badge.textColor = colour
    badge.setContentCompressionResistancePriority(.required, for: .horizontal)
    let label = NSTextField(labelWithString: relative(entry.path))
    label.font = .systemFont(ofSize: zoom.size(11))
    label.textColor = colour
    label.lineBreakMode = .byTruncatingMiddle
    return line(of: [badge, label], tooltip: "\(entry.path) — \(GitBadge.describe(entry))")
  }

  private func line(of views: [NSView], tooltip: String) -> NSView {
    let stack = NSStackView(views: views)
    stack.orientation = .horizontal
    stack.alignment = .centerY
    stack.spacing = 5
    stack.toolTip = tooltip
    return stack
  }
}
