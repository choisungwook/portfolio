import AppKit
import AkbunTerminalCore

/// A compact SourceTree-style commit graph. Git owns ordering and ref names;
/// the tested Swift model only assigns lanes, and this view turns them into
/// lines and rows.
@MainActor
final class GitTreeView: NSView, NSTableViewDataSource, NSTableViewDelegate {
  private let core: CoreBridge
  private let table = NSTableView()
  private let empty = NSTextField(wrappingLabelWithString: "")
  private var root: String?
  private var log = CoreGitLog.none
  private var graph = GitGraph.layout([])

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
    let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("commit"))
    column.resizingMask = .autoresizingMask
    table.addTableColumn(column)
    table.headerView = nil
    table.rowSizeStyle = .custom
    table.dataSource = self
    table.delegate = self
    table.backgroundColor = .clear
    table.menu = commitMenu()

    let scroll = NSScrollView()
    scroll.documentView = table
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

  func refresh() {
    log = root.map(core.gitLog) ?? .none
    graph = GitGraph.layout(log.commits)
    table.reloadData()
    updateVisibility()
  }

  private func updateVisibility() {
    let message: String?
    if root == nil {
      message = "Choose a folder for this project to see its Git tree."
    } else if !log.repository {
      message = "This folder is not a Git repository."
    } else if log.commits.isEmpty {
      message = "This repository has no commits."
    } else {
      message = nil
    }
    empty.stringValue = message ?? ""
    empty.isHidden = message == nil
    table.enclosingScrollView?.isHidden = message != nil
  }

  private func applyZoom() {
    empty.font = .systemFont(ofSize: zoom.size(12))
    table.rowHeight = CGFloat(zoom.size(38))
    table.reloadData()
  }

  private func applyPalette() {
    empty.textColor = palette.secondaryText
    table.reloadData()
  }

  private func commitMenu() -> NSMenu {
    let menu = NSMenu()
    menu.addItem(
      withTitle: "Copy Commit Hash", action: #selector(copyClickedHash), keyEquivalent: ""
    ).target = self
    return menu
  }

  @objc private func copyClickedHash() {
    guard table.clickedRow >= 0, table.clickedRow < log.commits.count else { return }
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(log.commits[table.clickedRow].hash, forType: .string)
  }

  func numberOfRows(in tableView: NSTableView) -> Int {
    log.commits.count
  }

  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
    let node = graph.nodes[row]
    let incoming = graph.segments.filter { $0.row == row - 1 }
    let outgoing = graph.segments.filter { $0.row == row }
    return GitCommitRowView(
      commit: log.commits[row], node: node, incoming: incoming, outgoing: outgoing,
      laneCount: graph.laneCount, zoom: zoom, palette: palette)
  }
}

@MainActor
private final class GitCommitRowView: NSView {
  init(
    commit: CoreGitCommit, node: GitGraphNode, incoming: [GitGraphSegment],
    outgoing: [GitGraphSegment], laneCount: Int, zoom: Zoom, palette: Palette
  ) {
    super.init(frame: .zero)
    let spacing = max(6, min(CGFloat(zoom.size(12)), 96 / CGFloat(max(laneCount, 1))))
    let graphWidth = spacing * CGFloat(laneCount) + 10
    let canvas = GitGraphCanvas(
      node: node, incoming: incoming, outgoing: outgoing, laneSpacing: spacing)
    canvas.translatesAutoresizingMaskIntoConstraints = false
    canvas.widthAnchor.constraint(equalToConstant: graphWidth).isActive = true

    let subject = NSTextField(labelWithString: commit.subject)
    subject.font = .systemFont(ofSize: zoom.size(12))
    subject.textColor = palette.text
    subject.lineBreakMode = .byTruncatingTail

    let refs = commit.refs.map { $0.replacingOccurrences(of: "HEAD -> ", with: "") }
      .joined(separator: ", ")
    let parts = [refs, commit.author, commit.date, String(commit.hash.prefix(7))]
      .filter { !$0.isEmpty }
    let detail = NSTextField(labelWithString: parts.joined(separator: " · "))
    detail.font = .systemFont(ofSize: zoom.size(10))
    detail.textColor = refs.isEmpty ? palette.secondaryText : palette.accent
    detail.lineBreakMode = .byTruncatingTail

    let labels = NSStackView(views: [subject, detail])
    labels.orientation = .vertical
    labels.alignment = .leading
    labels.spacing = 1
    let row = NSStackView(views: [canvas, labels])
    row.orientation = .horizontal
    row.alignment = .centerY
    row.spacing = 2
    row.translatesAutoresizingMaskIntoConstraints = false
    addSubview(row)
    NSLayoutConstraint.activate([
      row.topAnchor.constraint(equalTo: topAnchor),
      row.bottomAnchor.constraint(equalTo: bottomAnchor),
      row.leadingAnchor.constraint(equalTo: leadingAnchor),
      row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
    ])
    toolTip = "\(commit.subject)\n\(commit.hash)\n\(commit.author) · \(commit.date)"
    setAccessibilityElement(true)
    setAccessibilityLabel("\(commit.subject), \(commit.author), \(commit.date)")
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }
}

@MainActor
private final class GitGraphCanvas: NSView {
  private let node: GitGraphNode
  private let incoming: [GitGraphSegment]
  private let outgoing: [GitGraphSegment]
  private let laneSpacing: CGFloat

  init(
    node: GitGraphNode, incoming: [GitGraphSegment], outgoing: [GitGraphSegment],
    laneSpacing: CGFloat
  ) {
    self.node = node
    self.incoming = incoming
    self.outgoing = outgoing
    self.laneSpacing = laneSpacing
    super.init(frame: .zero)
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  override func draw(_ dirtyRect: NSRect) {
    super.draw(dirtyRect)
    let middle = bounds.midY
    for segment in incoming {
      drawLine(
        from: NSPoint(x: halfway(segment), y: bounds.maxY),
        to: NSPoint(x: x(segment.toLane), y: middle), colour: segment.colour)
    }
    for segment in outgoing {
      drawLine(
        from: NSPoint(x: x(segment.fromLane), y: middle),
        to: NSPoint(x: halfway(segment), y: bounds.minY), colour: segment.colour)
    }
    Self.colours[node.colour % Self.colours.count].setFill()
    NSBezierPath(
      ovalIn: NSRect(x: x(node.lane) - 4, y: middle - 4, width: 8, height: 8)
    ).fill()
  }

  private func drawLine(from: NSPoint, to: NSPoint, colour: Int) {
    let path = NSBezierPath()
    path.move(to: from)
    path.curve(
      to: to,
      controlPoint1: NSPoint(x: from.x, y: (from.y + to.y) / 2),
      controlPoint2: NSPoint(x: to.x, y: (from.y + to.y) / 2))
    path.lineWidth = 2
    Self.colours[colour % Self.colours.count].setStroke()
    path.stroke()
  }

  private func x(_ lane: Int) -> CGFloat {
    5 + CGFloat(lane) * laneSpacing
  }

  private func halfway(_ segment: GitGraphSegment) -> CGFloat {
    (x(segment.fromLane) + x(segment.toLane)) / 2
  }

  private static let colours: [NSColor] = [
    .systemRed, .systemBlue, .systemGreen, .systemPurple,
    .systemOrange, .systemTeal, .systemPink, .systemIndigo,
  ]
}
