import AppKit
import AkbunTerminalCore

/// Type a few characters, open the file they mean.
///
/// The file pane on the right is for looking around; this is for going straight
/// to something already known by name. It is a sheet rather than a panel of its
/// own because it belongs to the project the window has open: the root it
/// searches is that project's folder, and a palette that outlived the window it
/// was opened from would be searching somewhere else.
///
/// Which files a query means is the core's answer, not this view's. Everything
/// here is the list, the keyboard and the marks on the matched characters.
@MainActor
final class CommandPaletteView: NSView {
  /// A file was chosen. The window opens it in a tab, the same way a click in
  /// the file pane does.
  var onOpen: ((String) -> Void)?
  var onClose: (() -> Void)?

  private let core: CoreBridge
  private let root: String
  private let field = NSSearchField()
  private let table = NSTableView()
  private let scroll = NSScrollView()
  private let status = NSTextField(labelWithString: "")
  private var matches: [CoreMatch] = []
  private var palette = Palette.system
  private var zoom = Zoom()

  /// How many rows are asked for. More than fills the sheet, so scrolling has
  /// somewhere to go, and far less than a project has.
  private static let limit = 60

  init(core: CoreBridge, root: String, palette: Palette, zoom: Zoom) {
    self.core = core
    self.root = root
    self.palette = palette
    self.zoom = zoom
    super.init(frame: NSRect(x: 0, y: 0, width: 620, height: 420))
    setUp()
    search()
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  private func setUp() {
    wantsLayer = true
    layer?.backgroundColor = palette.panel.cgColor

    field.placeholderString = "Open file"
    field.target = self
    field.action = #selector(queryChanged)
    field.sendsSearchStringImmediately = true
    field.sendsWholeSearchString = false
    field.delegate = self
    field.font = .systemFont(ofSize: zoom.size(14))
    field.translatesAutoresizingMaskIntoConstraints = false

    status.textColor = palette.secondaryText
    status.font = .systemFont(ofSize: zoom.size(11))
    status.translatesAutoresizingMaskIntoConstraints = false

    let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("path"))
    column.resizingMask = .autoresizingMask
    table.addTableColumn(column)
    table.headerView = nil
    table.rowHeight = zoom.size(22)
    table.dataSource = self
    table.delegate = self
    table.backgroundColor = palette.panel
    table.target = self
    table.doubleAction = #selector(openSelected)
    table.selectionHighlightStyle = .regular
    scroll.documentView = table
    scroll.hasVerticalScroller = true
    scroll.drawsBackground = false
    scroll.translatesAutoresizingMaskIntoConstraints = false

    addSubview(field)
    addSubview(scroll)
    addSubview(status)
    NSLayoutConstraint.activate([
      field.topAnchor.constraint(equalTo: topAnchor, constant: 12),
      field.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      field.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
      scroll.topAnchor.constraint(equalTo: field.bottomAnchor, constant: 8),
      scroll.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      scroll.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
      status.topAnchor.constraint(equalTo: scroll.bottomAnchor, constant: 6),
      status.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      status.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
      status.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -10),
    ])
  }

  /// The keyboard belongs in the field the moment the sheet opens: the whole
  /// gesture is a keystroke followed by typing.
  func takeKeyboard() {
    window?.makeFirstResponder(field)
  }

  @objc private func queryChanged() {
    search()
  }

  private func search() {
    matches = core.findFiles(root: root, query: field.stringValue, limit: Self.limit)
    table.reloadData()
    if !matches.isEmpty {
      table.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false)
      table.scrollRowToVisible(0)
    }
    status.stringValue = summary()
  }

  /// What is under the list. The count is capped, so it says "first" rather
  /// than a number that would be a lie on a large project.
  private func summary() -> String {
    if field.stringValue.isEmpty {
      return matches.isEmpty ? "Nothing under this project" : "Type to narrow"
    }
    switch matches.count {
    case 0: return "No file matches"
    case Self.limit: return "First \(Self.limit) matches"
    case 1: return "1 match"
    case let count: return "\(count) matches"
    }
  }

  @objc private func openSelected() {
    let row = table.selectedRow
    guard matches.indices.contains(row) else { return }
    onOpen?(matches[row].path)
  }

  private func move(by rows: Int) {
    guard !matches.isEmpty else { return }
    // Wrapping, because a list reached by typing has no bottom worth stopping
    // at: the row after the last one is the first one.
    let next = (table.selectedRow + rows + matches.count) % matches.count
    table.selectRowIndexes(IndexSet(integer: next), byExtendingSelection: false)
    table.scrollRowToVisible(next)
  }
}

extension CommandPaletteView: NSTableViewDataSource, NSTableViewDelegate {
  func numberOfRows(in tableView: NSTableView) -> Int {
    matches.count
  }

  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int)
    -> NSView?
  {
    let identifier = NSUserInterfaceItemIdentifier("row")
    let field =
      tableView.makeView(withIdentifier: identifier, owner: self) as? NSTextField
      ?? {
        let field = NSTextField(labelWithString: "")
        field.identifier = identifier
        field.lineBreakMode = .byTruncatingHead
        return field
      }()
    field.attributedStringValue = Self.marked(
      matches[row], font: .systemFont(ofSize: zoom.size(12)), colour: palette.text,
      match: palette.text)
    return field
  }

  /// The matched characters in bold, the rest as it is.
  ///
  /// Marking them is what makes a fuzzy list readable: without it two rows with
  /// the same name look identical and the reader has to work out why one of
  /// them is above the other.
  static func marked(_ match: CoreMatch, font: NSFont, colour: NSColor, match highlight: NSColor)
    -> NSAttributedString
  {
    let text = NSMutableAttributedString(
      string: match.relative,
      attributes: [.font: font, .foregroundColor: colour.withAlphaComponent(0.65)])
    let bold = NSFontManager.shared.convert(font, toHaveTrait: .boldFontMask)
    let characters = Array(match.relative)
    for position in match.positions where position < characters.count {
      // The core counts characters and an attributed string counts UTF-16
      // units, which are the same thing until somebody has an emoji in a path.
      let prefix = String(characters[0..<position]).utf16.count
      let length = String(characters[position]).utf16.count
      text.addAttributes(
        [.font: bold, .foregroundColor: highlight],
        range: NSRange(location: prefix, length: length))
    }
    return text
  }
}

extension CommandPaletteView: NSSearchFieldDelegate {
  /// The arrows move the list while the keyboard stays in the field, return
  /// opens what is selected and escape closes. Anything else is typing.
  func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
    switch selector {
    case #selector(NSResponder.moveDown(_:)):
      move(by: 1)
      return true
    case #selector(NSResponder.moveUp(_:)):
      move(by: -1)
      return true
    case #selector(NSResponder.insertNewline(_:)):
      openSelected()
      return true
    case #selector(NSResponder.cancelOperation(_:)):
      onClose?()
      return true
    default:
      return false
    }
  }
}
