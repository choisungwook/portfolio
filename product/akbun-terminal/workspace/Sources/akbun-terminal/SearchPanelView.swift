import AppKit
import AkbunTerminalCore

/// Project-wide text search, in the pane on the right.
///
/// The pane rather than a sheet, because the answer is a list you read down
/// while the file you opened from it is still on screen. A sheet would cover the
/// thing it just took you to.
///
/// Command F and Command shift F are two different questions and stay two
/// different views: Command F marks matches inside the document already open,
/// and this one goes over files nobody has opened yet.
@MainActor
final class SearchPanelView: NSView, NSTableViewDataSource, NSTableViewDelegate {
  /// A hit was clicked. The controller opens the file and goes to the line.
  var onOpen: ((CoreHit) -> Void)?

  private let core: CoreBridge
  private let field = NSSearchField()
  private let table = NSTableView()
  private let summary = NSTextField(labelWithString: "")
  private var root: String?
  private var hits: [CoreHit] = []
  /// The keystroke that will run the search, cancelled by the next keystroke.
  private var pending: DispatchWorkItem?

  /// How long typing has to stop before the files are read.
  ///
  /// A search reads every file under the project, so running it per keystroke
  /// would read the project five times to answer one word. A short pause is long
  /// enough to collapse a typed word into one search and short enough that it
  /// still feels like it answers as you type.
  private static let quiet = 0.12

  /// Below this every project answers with thousands of lines, which is not an
  /// answer and costs the whole walk to produce.
  private static let shortest = 2

  var zoom = Zoom() {
    didSet {
      guard zoom != oldValue else { return }
      applyZoom()
    }
  }

  var palette = Palette.system {
    didSet { applyPalette() }
  }

  init(core: CoreBridge) {
    self.core = core
    super.init(frame: .zero)
    setUp()
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  private func setUp() {
    field.placeholderString = "Search in project"
    field.sendsWholeSearchString = false
    field.sendsSearchStringImmediately = true
    field.target = self
    field.action = #selector(queryChanged)
    field.translatesAutoresizingMaskIntoConstraints = false

    let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("hit"))
    column.resizingMask = .autoresizingMask
    table.addTableColumn(column)
    table.headerView = nil
    table.rowSizeStyle = .custom
    table.dataSource = self
    table.delegate = self
    table.target = self
    table.action = #selector(openClicked)
    table.backgroundColor = .clear

    let scroll = NSScrollView()
    scroll.documentView = table
    scroll.hasVerticalScroller = true
    scroll.drawsBackground = false
    scroll.translatesAutoresizingMaskIntoConstraints = false

    summary.translatesAutoresizingMaskIntoConstraints = false
    addSubview(field)
    addSubview(summary)
    addSubview(scroll)
    NSLayoutConstraint.activate([
      field.topAnchor.constraint(equalTo: topAnchor),
      field.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      field.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
      summary.topAnchor.constraint(equalTo: field.bottomAnchor, constant: 6),
      summary.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      summary.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
      scroll.topAnchor.constraint(equalTo: summary.bottomAnchor, constant: 6),
      scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
      scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
      scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
    applyZoom()
    applyPalette()
  }

  private func applyZoom() {
    field.font = .systemFont(ofSize: zoom.size(12))
    summary.font = .systemFont(ofSize: zoom.size(11))
    // Two lines in a row: the path above the line that matched.
    table.rowHeight = CGFloat(zoom.size(34))
    table.reloadData()
  }

  private func applyPalette() {
    summary.textColor = palette.secondaryText
    table.reloadData()
  }

  func show(root: String?) {
    guard self.root != root else { return }
    self.root = root
    hits = []
    field.stringValue = ""
    summary.stringValue = ""
    table.reloadData()
  }

  /// Puts the keyboard in the field, which is what Command shift F means.
  func beginSearch() {
    window?.makeFirstResponder(field)
    field.currentEditor()?.selectAll(nil)
  }

  @objc private func queryChanged() {
    pending?.cancel()
    let query = field.stringValue
    guard query.count >= Self.shortest, root != nil else {
      hits = []
      summary.stringValue = query.isEmpty ? "" : "Keep typing…"
      table.reloadData()
      return
    }
    let work = DispatchWorkItem { [weak self] in self?.run(query) }
    pending = work
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.quiet, execute: work)
  }

  // ponytail: the search runs on the main thread, so a very large project makes
  // the window pause for the length of one walk. The bridge holds one JSON coder
  // and is not safe to call from two threads, so moving this off the main thread
  // is a change to the bridge rather than to this line.
  private func run(_ query: String) {
    guard let root else { return }
    hits = core.searchText(root: root, query: query)
    let files = Set(hits.map(\.path)).count
    summary.stringValue =
      hits.isEmpty
      ? "No results"
      : "\(hits.count) result\(hits.count == 1 ? "" : "s") in \(files) file\(files == 1 ? "" : "s")"
    table.reloadData()
  }

  @objc private func openClicked() {
    guard table.clickedRow >= 0, table.clickedRow < hits.count else { return }
    onOpen?(hits[table.clickedRow])
  }

  func numberOfRows(in tableView: NSTableView) -> Int {
    hits.count
  }

  func tableView(_ tableView: NSTableView, viewFor column: NSTableColumn?, row: Int) -> NSView? {
    guard row < hits.count else { return nil }
    return HitRow(hit: hits[row], zoom: zoom, palette: palette)
  }

  func tableView(_ tableView: NSTableView, shouldSelectRow row: Int) -> Bool {
    true
  }
}

/// One result: where it is above, what is on the line below, with the matched
/// characters marked so the eye lands on them rather than re-reading the line.
private final class HitRow: NSView {
  init(hit: CoreHit, zoom: Zoom, palette: Palette) {
    super.init(frame: .zero)
    let place = NSTextField(labelWithString: "\(hit.relative):\(hit.line)")
    place.font = .systemFont(ofSize: zoom.size(10))
    place.textColor = palette.secondaryText
    place.lineBreakMode = .byTruncatingHead

    let line = NSTextField(labelWithAttributedString: Self.marked(hit, zoom: zoom, palette: palette))
    line.lineBreakMode = .byTruncatingTail

    let stack = NSStackView(views: [place, line])
    stack.orientation = .vertical
    stack.alignment = .leading
    stack.spacing = 1
    stack.edgeInsets = NSEdgeInsets(top: 2, left: 12, bottom: 2, right: 8)
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: topAnchor),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor),
      stack.leadingAnchor.constraint(equalTo: leadingAnchor),
      stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor),
    ])
  }

  /// The core counts the match in characters, so the range is built over the
  /// string's own characters rather than over UTF-16 offsets, which would land
  /// in the wrong place in any line holding an emoji or a Korean word.
  private static func marked(_ hit: CoreHit, zoom: Zoom, palette: Palette) -> NSAttributedString {
    let text = NSMutableAttributedString(
      string: hit.text,
      attributes: [
        .font: NSFont.monospacedSystemFont(ofSize: zoom.size(11), weight: .regular),
        .foregroundColor: palette.text,
      ])
    let characters = Array(hit.text)
    guard hit.column >= 0, hit.length > 0, hit.column + hit.length <= characters.count else {
      return text
    }
    let start = String(characters[..<hit.column]).utf16.count
    let length = String(characters[hit.column..<(hit.column + hit.length)]).utf16.count
    text.addAttributes(
      [.backgroundColor: palette.selection, .foregroundColor: palette.selectedText],
      range: NSRange(location: start, length: length))
    return text
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }
}
