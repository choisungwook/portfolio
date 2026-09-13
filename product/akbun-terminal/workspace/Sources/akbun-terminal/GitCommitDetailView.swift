import AppKit
import AkbunTerminalCore

/// What one commit did, under the Git tree it was clicked in.
///
/// A tree of subjects answers "what happened here" and nothing else; the next
/// question a reader always has is "what did that change", and until now the
/// only way to ask it was to leave the window. The core hands the patch over
/// already split per file, so this view is a list of files and one diff.
///
/// The diff is drawn rather than written into a text view as plain text,
/// because a patch is only readable when the two sides are told apart, and the
/// numbers down the side are not in the patch at all. Both come from `GitDiff`
/// in the core package, where they are tested without a window.
@MainActor
final class GitCommitDetailView: NSView, NSTableViewDataSource, NSTableViewDelegate {
  /// A file in the commit was double clicked. Carries the path as the diff
  /// spells it, relative to the repository root.
  var onOpenFile: ((String) -> Void)?

  private let core: CoreBridge
  private let subject = NSTextField(wrappingLabelWithString: "")
  private let meta = NSTextField(labelWithString: "")
  private let body = NSTextField(wrappingLabelWithString: "")
  private let files = NSTableView()
  private let filesScroll = NSScrollView()
  private let diff = NSTextView()
  private let diffScroll = NSScrollView()
  private let empty = NSTextField(
    wrappingLabelWithString: "Choose a commit to see what it changed.")
  private var filesHeight: NSLayoutConstraint!
  private var root: String?
  private var detail: CoreGitCommitDetail?

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
    subject.maximumNumberOfLines = 2
    subject.lineBreakMode = .byTruncatingTail
    meta.lineBreakMode = .byTruncatingTail
    body.maximumNumberOfLines = 4

    let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("file"))
    column.resizingMask = .autoresizingMask
    files.addTableColumn(column)
    files.headerView = nil
    files.rowSizeStyle = .custom
    files.dataSource = self
    files.delegate = self
    files.target = self
    files.doubleAction = #selector(openClickedFile)
    files.backgroundColor = .clear
    filesScroll.documentView = files
    filesScroll.hasVerticalScroller = true
    filesScroll.drawsBackground = false

    diff.isEditable = false
    diff.isSelectable = true
    diff.drawsBackground = false
    diff.textContainerInset = NSSize(width: 4, height: 4)
    // A diff is written in columns, so it wraps nowhere: a line that folds puts
    // its `+` under the text of the line above and stops being a diff.
    diff.isHorizontallyResizable = true
    diff.isVerticallyResizable = true
    diff.minSize = .zero
    diff.maxSize = NSSize(
      width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
    diff.textContainer?.widthTracksTextView = false
    diff.textContainer?.containerSize = NSSize(
      width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
    diffScroll.documentView = diff
    diffScroll.hasVerticalScroller = true
    diffScroll.hasHorizontalScroller = true
    diffScroll.drawsBackground = false

    let header = NSStackView(views: [subject, meta, body])
    header.orientation = .vertical
    header.alignment = .leading
    header.spacing = 2
    for view in [header, filesScroll, diffScroll, empty] as [NSView] {
      view.translatesAutoresizingMaskIntoConstraints = false
      addSubview(view)
    }
    filesHeight = filesScroll.heightAnchor.constraint(equalToConstant: 0)
    NSLayoutConstraint.activate([
      header.topAnchor.constraint(equalTo: topAnchor, constant: 8),
      header.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      header.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
      filesScroll.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 8),
      filesScroll.leadingAnchor.constraint(equalTo: leadingAnchor),
      filesScroll.trailingAnchor.constraint(equalTo: trailingAnchor),
      filesHeight,
      diffScroll.topAnchor.constraint(equalTo: filesScroll.bottomAnchor, constant: 4),
      diffScroll.leadingAnchor.constraint(equalTo: leadingAnchor),
      diffScroll.trailingAnchor.constraint(equalTo: trailingAnchor),
      diffScroll.bottomAnchor.constraint(equalTo: bottomAnchor),
      empty.topAnchor.constraint(equalTo: topAnchor, constant: 12),
      empty.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      empty.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
    ])
    applyZoom()
    applyPalette()
    show(root: nil, hash: nil)
  }

  /// Points the view at one commit. A nil hash is the state before anything has
  /// been clicked, and it is a sentence rather than an empty pane.
  func show(root: String?, hash: String?) {
    self.root = root
    guard let root, let hash else {
      detail = nil
      draw()
      return
    }
    detail = core.gitShow(in: root, hash: hash)
    draw()
    if !(detail?.files.isEmpty ?? true) {
      files.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false)
    }
  }

  private func draw() {
    let known = detail != nil
    subject.isHidden = !known
    meta.isHidden = !known
    body.isHidden = !known || detail?.body.isEmpty != false
    filesScroll.isHidden = !known
    diffScroll.isHidden = !known
    empty.isHidden = known
    guard let detail else {
      files.reloadData()
      diff.string = ""
      return
    }
    subject.stringValue = detail.commit.subject
    let refs = detail.commit.refs.map { $0.replacingOccurrences(of: "HEAD -> ", with: "") }
    let parts =
      [refs.joined(separator: ", "), detail.commit.author, detail.commit.date,
        String(detail.commit.hash.prefix(10))]
      .filter { !$0.isEmpty }
    meta.stringValue = parts.joined(separator: " · ")
    body.stringValue = detail.body
    files.reloadData()
    // Enough for the whole list until it is long enough to crowd out the diff,
    // which is what the panel is for.
    let rows = CGFloat(detail.files.count) * files.rowHeight + 4
    filesHeight.constant = min(rows, CGFloat(zoom.size(120)))
    showDiff(of: nil)
  }

  private func showDiff(of file: CoreGitDiffFile?) {
    guard let file else {
      diff.textStorage?.setAttributedString(NSAttributedString(string: ""))
      return
    }
    let text = NSMutableAttributedString()
    let font = NSFont.monospacedSystemFont(ofSize: zoom.size(11), weight: .regular)
    for line in GitDiff.lines(file.patch) {
      let gutter = NSAttributedString(
        string: number(line.oldLine) + number(line.newLine) + " ",
        attributes: [.font: font, .foregroundColor: palette.secondaryText])
      text.append(gutter)
      text.append(
        NSAttributedString(
          string: line.text + "\n",
          attributes: [.font: font, .foregroundColor: colour(of: line.kind)]))
    }
    diff.textStorage?.setAttributedString(text)
    diff.sizeToFit()
    diffScroll.documentView?.scroll(.zero)
  }

  /// A four wide column, or four spaces for the side that has no line there.
  private func number(_ line: Int?) -> String {
    guard let line else { return "    " }
    return String(String(line).suffix(4)).leftPadded(to: 4)
  }

  private func colour(of kind: GitDiffLine.Kind) -> NSColor {
    switch kind {
    case .added: return .systemGreen
    case .removed: return .systemRed
    case .hunk: return palette.accent
    case .header: return palette.secondaryText
    case .context: return palette.text
    }
  }

  private func applyZoom() {
    subject.font = .systemFont(ofSize: zoom.size(12), weight: .semibold)
    meta.font = .systemFont(ofSize: zoom.size(10))
    body.font = .systemFont(ofSize: zoom.size(11))
    empty.font = .systemFont(ofSize: zoom.size(12))
    files.rowHeight = CGFloat(zoom.size(18))
    draw()
  }

  private func applyPalette() {
    subject.textColor = palette.text
    meta.textColor = palette.secondaryText
    body.textColor = palette.secondaryText
    empty.textColor = palette.secondaryText
    files.reloadData()
    draw()
  }

  @objc private func openClickedFile() {
    guard let file = file(at: files.clickedRow), let root else { return }
    onOpenFile?(root + "/" + file.path)
  }

  private func file(at row: Int) -> CoreGitDiffFile? {
    guard let detail, row >= 0, row < detail.files.count else { return nil }
    return detail.files[row]
  }

  func numberOfRows(in tableView: NSTableView) -> Int {
    detail?.files.count ?? 0
  }

  func tableViewSelectionDidChange(_ notification: Notification) {
    showDiff(of: file(at: files.selectedRow))
  }

  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView?
  {
    guard let file = file(at: row) else { return nil }
    let entry = CoreGitEntry(path: file.path, status: file.status, stage: .staged)
    let badge = NSTextField(labelWithString: GitBadge.of(entry))
    badge.font = .monospacedSystemFont(ofSize: zoom.size(10), weight: .semibold)
    badge.textColor = colour(of: file.status)
    badge.setContentCompressionResistancePriority(.required, for: .horizontal)
    let name = NSTextField(labelWithString: file.path)
    name.font = .systemFont(ofSize: zoom.size(11))
    name.textColor = palette.text
    name.lineBreakMode = .byTruncatingMiddle
    let counts = NSTextField(labelWithString: "+\(file.additions) −\(file.deletions)")
    counts.font = .monospacedSystemFont(ofSize: zoom.size(10), weight: .regular)
    counts.textColor = palette.secondaryText
    counts.setContentCompressionResistancePriority(.required, for: .horizontal)
    let stack = NSStackView(views: [badge, name, counts])
    stack.orientation = .horizontal
    stack.alignment = .centerY
    stack.spacing = 6
    stack.edgeInsets = NSEdgeInsets(top: 0, left: 8, bottom: 0, right: 8)
    stack.toolTip = "\(file.path) — \(file.status.rawValue)"
    return stack
  }

  /// A committed file is past staging, so the green and orange pair that means
  /// "has git been told yet" says nothing here. The colour is what happened to
  /// the file instead.
  private func colour(of status: CoreFileStatus) -> NSColor {
    switch status {
    case .added: return .systemGreen
    case .deleted: return .systemRed
    case .renamed: return .systemPurple
    case .conflicted: return .systemPink
    case .untracked: return .systemGray
    case .modified: return palette.accent
    }
  }
}

extension String {
  /// Right aligns a gutter number. The diff below it is monospaced, so a column
  /// that does not line up is the one thing a reader notices first.
  fileprivate func leftPadded(to width: Int) -> String {
    count >= width ? self : String(repeating: " ", count: width - count) + self
  }
}
