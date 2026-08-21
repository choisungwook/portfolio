import AppKit
import AkbunTerminalCore

@MainActor
final class DocumentView: NSView {
  var onError: ((Error) -> Void)?
  var onOpenLink: ((String) -> Void)?

  private(set) var path: String?
  private(set) var isDirty = false
  private var isMarkdown = false
  private var isHTML = false

  private enum Mode {
    case read
    case edit
  }

  private var mode = Mode.read
  private let core: CoreBridge
  private let highlighter = CodeHighlighter()

  var zoom = Zoom() {
    didSet {
      guard zoom != oldValue else { return }
      applyZoom()
    }
  }

  var palette = Palette.system {
    didSet { applyPalette() }
  }

  private let title = NSTextField(labelWithString: "")
  private let language = NSTextField(labelWithString: "")
  private let viewButton = NSButton()
  private let editButton = NSButton()
  private let openButton = NSButton(title: "Open in Browser", target: nil, action: nil)
  private let saveButton = NSButton(title: "Save", target: nil, action: nil)
  private let reader = NSTextView()
  private let source = NSTextView()
  private let readerScroll = NSScrollView()
  private let sourceScroll = NSScrollView()
  private lazy var preview = makePreview()

  private let findBar = NSStackView()
  private let findField = NSSearchField()
  private let findCount = NSTextField(labelWithString: "")
  private lazy var findBarHeight = findBar.heightAnchor.constraint(equalToConstant: 0)
  private var matches: [NSRange] = []
  private var matchIndex: Int?
  private weak var marked: NSTextView?
  private var isMarking = false

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
    title.lineBreakMode = .byTruncatingMiddle
    configureModeButton(viewButton, symbol: "eye", label: "View", action: #selector(showReadMode))
    configureModeButton(editButton, symbol: "pencil", label: "Edit", action: #selector(showEditMode))

    openButton.target = self
    openButton.action = #selector(openInBrowser)
    openButton.bezelStyle = .accessoryBarAction
    openButton.isHidden = true
    saveButton.target = self
    saveButton.action = #selector(save)
    saveButton.bezelStyle = .accessoryBarAction

    let header = NSStackView(
      views: [title, language, NSView(), viewButton, editButton, openButton, saveButton])
    header.orientation = .horizontal
    header.alignment = .centerY
    header.spacing = 8
    header.translatesAutoresizingMaskIntoConstraints = false

    setUpFindBar()
    configure(scroll: readerScroll, text: reader, editable: false)
    configure(scroll: sourceScroll, text: source, editable: true)
    source.delegate = self
    sourceScroll.isHidden = true
    applyZoom()
    applyPalette()

    addSubview(header)
    addSubview(findBar)
    addSubview(readerScroll)
    addSubview(sourceScroll)
    NSLayoutConstraint.activate([
      header.topAnchor.constraint(equalTo: topAnchor, constant: 8),
      header.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      header.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
      findBar.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 6),
      findBar.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      findBar.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
    ])
    for scroll in [readerScroll, sourceScroll] {
      NSLayoutConstraint.activate([
        scroll.topAnchor.constraint(equalTo: findBar.bottomAnchor, constant: 6),
        scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
        scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
        scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
      ])
    }
  }

  private func configureModeButton(
    _ button: NSButton, symbol: String, label: String, action: Selector
  ) {
    button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: label)
    button.imagePosition = .imageOnly
    button.bezelStyle = .accessoryBarAction
    button.toolTip = label
    button.setAccessibilityLabel(label)
    button.target = self
    button.action = action
  }

  private func configure(scroll: NSScrollView, text: NSTextView, editable: Bool) {
    text.isEditable = editable
    text.isRichText = false
    text.isAutomaticQuoteSubstitutionEnabled = false
    text.autoresizingMask = [.width]
    text.textContainerInset = NSSize(width: 12, height: 10)
    text.drawsBackground = false
    scroll.documentView = text
    scroll.hasVerticalScroller = true
    scroll.drawsBackground = false
    scroll.translatesAutoresizingMaskIntoConstraints = false
  }

  private func setUpFindBar() {
    findField.placeholderString = "Find"
    findField.target = self
    findField.action = #selector(findFieldChanged)
    findField.sendsSearchStringImmediately = true
    findField.sendsWholeSearchString = false
    findField.delegate = self
    let previous = NSButton(title: "‹", target: self, action: #selector(findPrevious))
    let next = NSButton(title: "›", target: self, action: #selector(findNext))
    let done = NSButton(title: "Done", target: self, action: #selector(closeFind))
    for button in [previous, next, done] { button.bezelStyle = .accessoryBarAction }
    findCount.alignment = .right
    findBar.setViews([findField, previous, next, findCount, done], in: .leading)
    findBar.orientation = .horizontal
    findBar.alignment = .centerY
    findBar.spacing = 6
    findBar.isHidden = true
    findBar.translatesAutoresizingMaskIntoConstraints = false
    findBarHeight.isActive = true
    findField.setContentHuggingPriority(.init(1), for: .horizontal)
    NSLayoutConstraint.activate([
      findField.widthAnchor.constraint(greaterThanOrEqualToConstant: 200),
      findCount.widthAnchor.constraint(greaterThanOrEqualToConstant: 90),
    ])
  }

  private func showFindBar(_ visible: Bool) {
    findBar.isHidden = !visible
    findBarHeight.isActive = !visible
  }

  private func applyPalette() {
    layer?.backgroundColor = palette.background.cgColor
    title.textColor = palette.text
    language.textColor = palette.secondaryText
    findCount.textColor = palette.secondaryText
    for text in [reader, source] {
      text.textColor = palette.text
      text.insertionPointColor = palette.text
      text.selectedTextAttributes = [
        .backgroundColor: palette.selection,
        .foregroundColor: palette.text,
      ]
    }
    updateModeButtons()
    guard path != nil else { return }
    renderReadMode()
  }

  func open(path target: String) {
    do {
      let text = try core.text(ofFile: target)
      path = target
      isMarkdown = DocumentLink.isMarkdown(target)
      isHTML = Self.isHTML(target)
      title.stringValue = (target as NSString).lastPathComponent
      source.string = text
      isDirty = false
      openButton.isHidden = !isHTML
      viewButton.toolTip = isMarkdown ? "Preview" : "View"
      viewButton.setAccessibilityLabel(isMarkdown ? "Preview" : "View")
      show(.read)
    } catch {
      onError?(error)
    }
  }

  static func isHTML(_ path: String) -> Bool {
    ["html", "htm"].contains((path as NSString).pathExtension.lowercased())
  }

  @objc func save() {
    guard let path else { return }
    do {
      try core.expectOk(.writeFile(path: path, text: source.string))
      isDirty = false
      updateTitle()
    } catch {
      onError?(error)
    }
  }

  @objc private func openInBrowser() {
    guard isHTML, let path else { return }
    if isDirty {
      let alert = NSAlert()
      alert.messageText = "Open the HTML file in your browser?"
      alert.informativeText = "This file has changes that have not been written."
      alert.addButton(withTitle: "Save and Open")
      alert.addButton(withTitle: "Open Saved Version")
      alert.addButton(withTitle: "Cancel")
      switch alert.runModal() {
      case .alertFirstButtonReturn:
        save()
        guard !isDirty else { return }
      case .alertSecondButtonReturn:
        break
      default:
        return
      }
    }
    Browsers.open(URL(fileURLWithPath: path), in: nil)
  }

  func confirmDiscardingChanges() -> Bool {
    guard isDirty, let path else { return true }
    let alert = NSAlert()
    alert.messageText = "Save changes to \((path as NSString).lastPathComponent)?"
    alert.informativeText = "The file has changes that have not been written."
    alert.addButton(withTitle: "Save")
    alert.addButton(withTitle: "Discard")
    alert.addButton(withTitle: "Cancel")
    switch alert.runModal() {
    case .alertFirstButtonReturn:
      save()
      return !isDirty
    case .alertSecondButtonReturn:
      isDirty = false
      return true
    default:
      return false
    }
  }

  var focusView: NSView {
    if !findBar.isHidden { return findField }
    if mode == .edit { return source }
    return isMarkdown ? preview : reader
  }

  func toggleEditing() {
    show(mode == .edit ? .read : .edit)
  }

  @objc private func showReadMode() {
    show(.read)
  }

  @objc private func showEditMode() {
    show(.edit)
  }

  private func show(_ wanted: Mode) {
    mode = wanted
    if wanted == .read { renderReadMode() }
    readerScroll.isHidden = wanted != .read || isMarkdown
    sourceScroll.isHidden = wanted != .edit
    preview.isHidden = wanted != .read || !isMarkdown
    updateModeButtons()
    if !findBar.isHidden { runSearch(keepingIndex: false) }
    window?.makeFirstResponder(focusView)
  }

  private func updateModeButtons() {
    viewButton.contentTintColor = mode == .read ? palette.accent : palette.secondaryText
    editButton.contentTintColor = mode == .edit ? palette.accent : palette.secondaryText
  }

  private func makePreview() -> MarkdownPreviewView {
    let view = MarkdownPreviewView()
    view.translatesAutoresizingMaskIntoConstraints = false
    view.onError = { [weak self] error in self?.onError?(error) }
    view.onOpenLink = { [weak self] link in self?.onOpenLink?(link) }
    view.isHidden = true
    addSubview(view)
    NSLayoutConstraint.activate([
      view.topAnchor.constraint(equalTo: findBar.bottomAnchor, constant: 6),
      view.leadingAnchor.constraint(equalTo: leadingAnchor),
      view.trailingAnchor.constraint(equalTo: trailingAnchor),
      view.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
    return view
  }

  private func renderReadMode() {
    guard let path else { return }
    if isMarkdown {
      language.stringValue = "Markdown"
      preview.render(source: source.string, path: path, palette: palette, zoom: zoom)
      return
    }
    let result = highlighter.render(source: source.string, path: path, zoom: zoom, palette: palette)
    language.stringValue = result.language
    reader.textStorage?.setAttributedString(result.text)
  }

  func beginFind() {
    if let text = currentTextView {
      let selected = text.selectedRange()
      if selected.length > 0 {
        findField.stringValue = (text.string as NSString).substring(with: selected)
      }
    }
    showFindBar(true)
    runSearch(keepingIndex: false)
    window?.makeFirstResponder(findField)
    findField.currentEditor()?.selectAll(nil)
  }

  @objc private func closeFind() {
    showFindBar(false)
    clearMarks()
    matches = []
    matchIndex = nil
    if isMarkdown { preview.find("", index: nil) { _, _ in } }
    window?.makeFirstResponder(focusView)
  }

  @objc private func findFieldChanged() {
    runSearch(keepingIndex: false)
  }

  @objc func findNext() {
    guard !findBar.isHidden else {
      beginFind()
      return
    }
    step(forward: true)
  }

  @objc func findPrevious() {
    guard !findBar.isHidden else {
      beginFind()
      return
    }
    step(forward: false)
  }

  private func step(forward: Bool) {
    if mode == .read, isMarkdown {
      let next = (matchIndex ?? (forward ? -1 : 0)) + (forward ? 1 : -1)
      runPreviewSearch(index: next)
      return
    }
    guard let text = currentTextView, !matches.isEmpty else { return }
    let from = matchIndex.map { matches[$0].location } ?? text.selectedRange().location
    matchIndex = forward
      ? DocumentSearch.next(after: from, in: matches)
      : DocumentSearch.previous(before: from, in: matches)
    revealMatch(in: text)
  }

  private func runSearch(keepingIndex: Bool) {
    clearMarks()
    if mode == .read, isMarkdown {
      runPreviewSearch(index: keepingIndex ? matchIndex : nil)
      return
    }
    guard let text = currentTextView else { return }
    matches = DocumentSearch.matches(of: findField.stringValue, in: text.string)
    if !keepingIndex {
      matchIndex = matches.isEmpty
        ? nil : DocumentSearch.next(after: text.selectedRange().location - 1, in: matches)
    }
    markMatches(in: text)
    if matchIndex != nil {
      revealMatch(in: text)
    } else {
      findCount.stringValue = DocumentSearch.summary(index: nil, total: matches.count)
    }
  }

  private func runPreviewSearch(index: Int?) {
    preview.find(findField.stringValue, index: index) { [weak self] total, selected in
      guard let self else { return }
      self.matchIndex = selected
      self.findCount.stringValue = DocumentSearch.summary(index: selected, total: total)
    }
  }

  private func markMatches(in text: NSTextView) {
    guard let storage = text.textStorage, !matches.isEmpty else { return }
    isMarking = true
    defer { isMarking = false }
    storage.beginEditing()
    for range in matches where NSMaxRange(range) <= storage.length {
      storage.addAttribute(
        .backgroundColor, value: NSColor.systemYellow.withAlphaComponent(0.35), range: range)
    }
    storage.endEditing()
    marked = text
  }

  private func clearMarks() {
    guard let text = marked, let storage = text.textStorage else { return }
    isMarking = true
    defer { isMarking = false }
    storage.removeAttribute(
      .backgroundColor, range: NSRange(location: 0, length: storage.length))
    marked = nil
  }

  private func revealMatch(in text: NSTextView) {
    guard let index = matchIndex, matches.indices.contains(index) else { return }
    let range = matches[index]
    guard NSMaxRange(range) <= (text.string as NSString).length else { return }
    text.setSelectedRange(range)
    text.scrollRangeToVisible(range)
    findCount.stringValue = DocumentSearch.summary(index: index, total: matches.count)
  }

  private var currentTextView: NSTextView? {
    if mode == .edit { return source }
    return isMarkdown ? nil : reader
  }

  private func applyZoom() {
    title.font = .systemFont(ofSize: zoom.size(12), weight: .medium)
    language.font = .systemFont(ofSize: zoom.size(11))
    findCount.font = .systemFont(ofSize: zoom.size(11))
    source.font = .monospacedSystemFont(ofSize: zoom.size(12), weight: .regular)
    guard path != nil else { return }
    renderReadMode()
  }

  private func updateTitle() {
    guard let path else { return }
    let name = (path as NSString).lastPathComponent
    title.stringValue = isDirty ? "\(name) — edited" : name
  }
}

extension DocumentView: NSTextViewDelegate {
  func textDidChange(_ notification: Notification) {
    guard !isMarking, !isDirty else { return }
    isDirty = true
    updateTitle()
  }
}

extension DocumentView: NSSearchFieldDelegate {
  func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
    switch selector {
    case #selector(NSResponder.insertNewline(_:)):
      step(forward: true)
      return true
    case #selector(NSResponder.cancelOperation(_:)):
      closeFind()
      return true
    default:
      return false
    }
  }
}
