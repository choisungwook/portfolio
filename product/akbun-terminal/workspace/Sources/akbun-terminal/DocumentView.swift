import AppKit
import AkbunTerminalCore
import WebKit

/// One file, in a tab of its own.
///
/// Modes over one area rather than a split preview: a tab is the whole area
/// under the strip, and halving it would leave two columns of nothing. Reading
/// is what a file is opened for, so that is the mode a click lands in; editing
/// is one keystroke away and never the default.
///
/// It opened markdown alone at first, which meant the file pane could show a
/// repository and open a tenth of it. Every file opens now: markdown is
/// rendered, everything else is coloured by the core's highlighter, and the
/// mode switch is the same for both.
///
/// Two kinds of file have a third mode. Markdown carries mermaid, and HTML is a
/// page rather than a document, and neither can be drawn as an attributed
/// string. Both are drawn by a web view that never runs anything a document
/// brought with it: the diagram is photographed into the text flow, and the page
/// is rendered with scripting off. What the read side shows is still the buffer,
/// not the file, so a preview follows what is being typed.
@MainActor
final class DocumentView: NSView {
  var onError: ((Error) -> Void)?
  /// A command click landed on a link. The destination is passed exactly as the
  /// document wrote it; deciding what it points at is the window's job.
  var onOpenLink: ((String) -> Void)?

  private(set) var path: String?
  private(set) var isDirty = false
  /// Markdown has something to render. Everything else has something to colour.
  private var isMarkdown = false
  /// HTML has a page to draw as well as source to read.
  private var isHTML = false

  /// Which of the three the tab is showing. The segments differ by file kind,
  /// so the mode is kept rather than read back out of the control.
  private enum Mode {
    /// Rendered markdown, or coloured source for everything else.
    case read
    /// The web view: a drawn page. Only ever reached for HTML.
    case render
    case edit
  }

  private var mode = Mode.read

  /// Everything in the window is one size, so the document follows the terminal.
  var zoom = Zoom() {
    didSet {
      guard zoom != oldValue else { return }
      applyZoom()
    }
  }

  /// A document fills the same area as a terminal, so it wears the terminal's
  /// background rather than the system's paper colour beside it.
  var palette = Palette.system {
    didSet { applyPalette() }
  }

  private let core: CoreBridge
  private let title = NSTextField(labelWithString: "")
  /// What the core made of the file: a language name, or nothing when it did
  /// not recognise one. Shown so a reader can tell an unknown language from a
  /// file with nothing worth colouring in it.
  private let language = NSTextField(labelWithString: "")
  private let modes = NSSegmentedControl(
    labels: ["View", "Edit"], trackingMode: .selectOne, target: nil, action: nil)
  private let saveButton = NSButton(title: "Save", target: nil, action: nil)
  private let reader = LinkTextView()
  private let source = NSTextView()
  private let readerScroll = NSScrollView()
  private let sourceScroll = NSScrollView()
  /// Made on the first HTML file rather than for every text file, because a web
  /// view is expensive and most tabs never need one.
  private var page: WKWebView?

  // MARK: Find

  private let findBar = NSStackView()
  private let findField = NSSearchField()
  private let findCount = NSTextField(labelWithString: "")
  /// Held on to rather than made each time, because turning the bar on and off
  /// is turning this one constraint off and on.
  private lazy var findBarHeight = findBar.heightAnchor.constraint(equalToConstant: 0)
  private var matches: [NSRange] = []
  private var matchIndex: Int?
  /// The text view the marks are on, so they can be taken off again when the
  /// mode changes underneath the bar.
  private weak var marked: NSTextView?
  /// Marking a match paints the text storage, and a text view can report that
  /// as a change. The file has not been touched, so the flag says so.
  private var isMarking = false

  // MARK: Diagrams

  private lazy var mermaid = MermaidRenderer(host: self)
  /// Drawn diagrams by source. Kept per document because the page is rebuilt
  /// whenever anything changes, and drawing them again each time would make
  /// every keystroke in edit mode cost a web view.
  private var diagrams: [String: NSImage] = [:]
  /// What has been asked for and not answered yet, so a redraw does not queue
  /// the same diagram twice.
  private var pendingDiagrams: Set<String> = []

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
    modes.selectedSegment = 0
    modes.target = self
    modes.action = #selector(modeChanged)
    saveButton.target = self
    saveButton.action = #selector(save)
    saveButton.bezelStyle = .accessoryBarAction

    let header = NSStackView(views: [title, language, NSView(), modes, saveButton])
    header.orientation = .horizontal
    header.alignment = .centerY
    header.spacing = 8
    header.translatesAutoresizingMaskIntoConstraints = false

    setUpFindBar()
    configure(scroll: readerScroll, text: reader, editable: false)
    configure(scroll: sourceScroll, text: source, editable: true)
    source.delegate = self
    reader.onCommandClick = { [weak self] link in self?.onOpenLink?(link) }
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

  /// Shows or hides the bar, and takes its height with it. A hidden stack view
  /// still asks for its own height, which would leave a strip of nothing above
  /// every document that has never been searched.
  private func showFindBar(_ visible: Bool) {
    findBar.isHidden = !visible
    findBarHeight.isActive = !visible
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
    for button in [previous, next, done] {
      button.bezelStyle = .accessoryBarAction
    }
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

  private func applyPalette() {
    layer?.backgroundColor = palette.background.cgColor
    title.textColor = palette.text
    language.textColor = palette.secondaryText
    findCount.textColor = palette.secondaryText
    for text in [reader as NSTextView, source] {
      text.textColor = palette.text
      // The caret and the selection are the two things a text view draws in a
      // colour of its own, and both disappear against a themed background.
      text.insertionPointColor = palette.text
      text.selectedTextAttributes = [
        .backgroundColor: palette.selection, .foregroundColor: palette.text,
      ]
    }
    guard path != nil else { return }
    // A theme change is a different diagram: mermaid draws its own text and
    // lines, and the dark ones are unreadable on a light page.
    diagrams.removeAll()
    renderReader()
    renderPage()
  }

  /// Loads a file. The caller has already dealt with anything unsaved, because
  /// asking here would put the question in the middle of drawing.
  func open(path target: String) {
    do {
      let text = try core.text(ofFile: target)
      path = target
      isMarkdown = DocumentLink.isMarkdown(target)
      isHTML = Self.isHTML(target)
      diagrams.removeAll()
      pendingDiagrams.removeAll()
      // Markdown's read mode is a rendered page; every other file's is the same
      // text in colour. HTML has both, and says so with a third segment.
      modes.segmentCount = isHTML ? 3 : 2
      modes.setLabel(isMarkdown ? "Preview" : "View", forSegment: 0)
      if isHTML {
        modes.setLabel("Render", forSegment: 1)
        modes.setLabel("Edit", forSegment: 2)
      } else {
        modes.setLabel("Edit", forSegment: 1)
      }
      title.stringValue = (target as NSString).lastPathComponent
      source.string = text
      isDirty = false
      // Reading is what a click on a file meant, so that is the mode it lands
      // in. `show` draws the read side on the way.
      show(.read)
    } catch {
      onError?(error)
    }
  }

  /// Whether a path is a page rather than a document. Two suffixes, both of
  /// which every browser treats the same way.
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

  /// Asks about unsaved work. `false` means the caller must stay where it is.
  /// Saving here rather than in the caller keeps the file's text in one place.
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

  /// The view that should take the keyboard when this tab comes forward. The
  /// find field wins while it is open, because that is what was just asked for.
  var focusView: NSView {
    if !findBar.isHidden { return findField }
    switch mode {
    case .edit:
      return source
    case .render:
      if let page { return page }
      return reader
    case .read:
      return reader
    }
  }

  /// The other half of "a click opens a file to read". One keystroke turns the
  /// file being read into the file being changed, and back.
  func toggleEditing() {
    show(mode == .edit ? .read : .edit)
  }

  @objc private func modeChanged() {
    show(modeForSegment(modes.selectedSegment))
  }

  private func modeForSegment(_ segment: Int) -> Mode {
    guard isHTML else { return segment == 1 ? .edit : .read }
    switch segment {
    case 1: return .render
    case 2: return .edit
    default: return .read
    }
  }

  private func segment(for mode: Mode) -> Int {
    switch mode {
    case .read: return 0
    case .render: return 1
    case .edit: return isHTML ? 2 : 1
    }
  }

  private func show(_ asked: Mode) {
    // A file that is not HTML has no page to go to, so the mode is one it
    // actually has.
    let wanted: Mode = (asked == .render && !isHTML) ? .read : asked
    // Leaving the editor is the moment the read side is out of date, and the
    // only moment: the core is not asked on every keystroke.
    mode = wanted
    if wanted != .edit {
      renderReader()
    }
    if wanted == .render {
      renderPage()
    }
    modes.selectedSegment = segment(for: wanted)
    readerScroll.isHidden = wanted != .read
    sourceScroll.isHidden = wanted != .edit
    page?.isHidden = wanted != .render
    // The marks belong to whichever view was on screen, and the one arriving
    // has its own text, so the search is run again rather than carried over.
    if !findBar.isHidden {
      runSearch(keepingIndex: false)
    }
    window?.makeFirstResponder(focusView)
  }

  // MARK: Find

  /// Opens the find bar, or moves the keyboard back into it when it is already
  /// open. The selection comes with it: finding what is highlighted is what
  /// Command F means in every other editor.
  func beginFind() {
    let text = currentTextView
    let selected = text?.selectedRange() ?? NSRange(location: 0, length: 0)
    if selected.length > 0, let string = text?.string {
      findField.stringValue = (string as NSString).substring(with: selected)
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
    guard let text = currentTextView, !matches.isEmpty else { return }
    let from = matchIndex.map { matches[$0].location } ?? text.selectedRange().location
    matchIndex =
      forward
      ? DocumentSearch.next(after: from, in: matches)
      : DocumentSearch.previous(before: from, in: matches)
    revealMatch(in: text)
  }

  /// Runs the query over whichever view is on screen and marks every hit.
  ///
  /// The web view is not searched: it is drawing HTML rather than showing text,
  /// and the same file's source is one segment away. Saying so with an empty
  /// count is better than a bar that looks broken.
  private func runSearch(keepingIndex: Bool) {
    clearMarks()
    let query = findField.stringValue
    guard let text = currentTextView else {
      matches = []
      matchIndex = nil
      findCount.stringValue = mode == .render ? "Not in render" : ""
      return
    }
    matches = DocumentSearch.matches(of: query, in: text.string)
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
    switch mode {
    case .edit: return source
    case .read: return reader
    case .render: return nil
    }
  }

  // MARK: Drawing

  /// Draws the read side from whatever the file is: blocks for markdown,
  /// coloured tokens for everything else.
  private func renderReader() {
    guard path != nil else { return }
    if isMarkdown {
      renderMarkdown()
    } else {
      renderCode()
    }
    if !findBar.isHidden, mode != .edit {
      runSearch(keepingIndex: true)
    }
  }

  private func renderMarkdown() {
    language.stringValue = "Markdown"
    do {
      let blocks = try core.markdown(source.string)
      reader.textStorage?.setAttributedString(
        MarkdownAttributedText.build(
          blocks, zoom: zoom, colour: palette.text, diagrams: diagrams))
      drawMissingDiagrams(in: blocks)
    } catch {
      onError?(error)
    }
  }

  /// Asks for every diagram that has not been drawn yet, and redraws the page
  /// when one arrives. Until then its source is what the reader shows, so a
  /// document is readable while its diagrams are still being made.
  private func drawMissingDiagrams(in blocks: [CoreBlock]) {
    for diagram in MarkdownAttributedText.mermaidSources(in: blocks) {
      guard diagrams[diagram] == nil, !pendingDiagrams.contains(diagram) else { continue }
      pendingDiagrams.insert(diagram)
      let width = max(320, bounds.width - 60)
      mermaid.image(source: diagram, dark: isDarkBackground, width: width) { [weak self] image in
        guard let self else { return }
        self.pendingDiagrams.remove(diagram)
        // A diagram mermaid refused stays as its source. Nothing else can be
        // shown that is more use than the code somebody typed.
        guard let image else { return }
        self.diagrams[diagram] = image
        if self.mode != .edit, self.isMarkdown {
          self.renderMarkdown()
        }
      }
    }
  }

  /// Which way mermaid should draw. The theme is the window's, so a diagram on
  /// a dark page is drawn dark rather than as a white rectangle in the middle
  /// of it.
  private var isDarkBackground: Bool {
    guard let colour = palette.background.usingColorSpace(.sRGB) else { return false }
    return colour.brightnessComponent < 0.5
  }

  private func renderCode() {
    guard let path else { return }
    // A core that cannot answer still leaves a file to read. The text falls
    // back to itself in one colour rather than to an empty tab, which is what
    // an older core without the highlight command would otherwise produce.
    let highlighted = (try? core.highlight(path: path, text: source.string)) ?? uncoloured()
    // A language nobody recognised is said out loud rather than left blank, so
    // an uncoloured file does not read as a broken one.
    language.stringValue = highlighted.language ?? "Plain text"
    reader.textStorage?.setAttributedString(
      CodeAttributedText.build(highlighted, zoom: zoom, palette: palette))
  }

  /// Draws the HTML as a page.
  ///
  /// Scripting is off. This is a file out of whatever repository the browser on
  /// the right is pointed at, and rendering it is for looking at the layout, not
  /// for running it; the base URL is the file's own folder, so a stylesheet or
  /// an image beside it still loads.
  private func renderPage() {
    guard isHTML, let path, mode == .render else { return }
    let web = pageView()
    let folder = URL(fileURLWithPath: (path as NSString).deletingLastPathComponent)
    web.loadHTMLString(source.string, baseURL: folder)
  }

  private func pageView() -> WKWebView {
    if let page { return page }
    let configuration = WKWebViewConfiguration()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = false
    let web = WKWebView(frame: bounds, configuration: configuration)
    web.translatesAutoresizingMaskIntoConstraints = false
    addSubview(web)
    NSLayoutConstraint.activate([
      web.topAnchor.constraint(equalTo: findBar.bottomAnchor, constant: 6),
      web.leadingAnchor.constraint(equalTo: leadingAnchor),
      web.trailingAnchor.constraint(equalTo: trailingAnchor),
      web.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
    page = web
    return web
  }

  /// The file as its own text, one plain token per line. The answer when the
  /// core refuses, so losing the colour never costs the contents.
  private func uncoloured() -> CoreHighlighted {
    CoreHighlighted(
      language: nil,
      lines: source.string.components(separatedBy: "\n").map { line in
        line.isEmpty ? [] : [CoreToken(text: line, kind: .plain)]
      })
  }

  /// Both halves are redrawn, not only the one on screen: the other is one
  /// segment click away and a document that changes size when it is looked at
  /// is worse than one that was the wrong size all along.
  private func applyZoom() {
    title.font = .systemFont(ofSize: zoom.size(12), weight: .medium)
    language.font = .systemFont(ofSize: zoom.size(11))
    findCount.font = .systemFont(ofSize: zoom.size(11))
    source.font = .monospacedSystemFont(ofSize: zoom.size(12), weight: .regular)
    guard path != nil else { return }
    renderReader()
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
  /// Return in the find field goes to the next match rather than closing the
  /// bar, and escape puts it away. Both are what the field is expected to do.
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

/// A read only text view that answers a command click on a link.
///
/// The gesture is command click rather than a plain one because the read side
/// is also where text is selected, and because a document is something being
/// read rather than a set of buttons. Everything else goes to the text view, so
/// selecting and scrolling are untouched.
private final class LinkTextView: NSTextView {
  var onCommandClick: ((String) -> Void)?

  override func mouseDown(with event: NSEvent) {
    guard event.modifierFlags.contains(.command), let link = link(at: event) else {
      super.mouseDown(with: event)
      return
    }
    onCommandClick?(link)
  }

  private func link(at event: NSEvent) -> String? {
    guard let storage = textStorage, storage.length > 0 else { return nil }
    let point = convert(event.locationInWindow, from: nil)
    let insertion = characterIndexForInsertion(at: point)
    // The insertion point is between two characters, so the click that landed on
    // the last character of a link reports the index after it.
    for index in [insertion, insertion - 1] where index >= 0 && index < storage.length {
      if let link = storage.attribute(MarkdownAttributedText.linkKey, at: index, effectiveRange: nil)
        as? String
      {
        return link
      }
    }
    return nil
  }
}
