import AppKit
import AkbunTerminalCore

/// A markdown file, in a tab of its own.
///
/// One area with two modes rather than a split preview: a tab is the whole area
/// under the strip, and halving it would leave two columns of nothing. The
/// rendered side is an attributed string in a plain text view, which is why no
/// HTML and no second web view appear anywhere here.
///
/// It used to be a pane under the terminal. Sharing the tab strip is what makes
/// a document as easy to leave and come back to as a shell, and it is also what
/// lets a link inside one document open another beside it.
@MainActor
final class MarkdownDocumentView: NSView {
  var onError: ((Error) -> Void)?
  /// A command click landed on a link. The destination is passed exactly as the
  /// document wrote it; deciding what it points at is the window's job.
  var onOpenLink: ((String) -> Void)?

  private(set) var path: String?
  private(set) var isDirty = false

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
  private let modes = NSSegmentedControl(
    labels: ["Preview", "Source"], trackingMode: .selectOne, target: nil, action: nil)
  private let saveButton = NSButton(title: "Save", target: nil, action: nil)
  private let preview = LinkTextView()
  private let source = NSTextView()
  private let previewScroll = NSScrollView()
  private let sourceScroll = NSScrollView()

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
    saveButton.keyEquivalent = "s"
    saveButton.keyEquivalentModifierMask = .command

    let header = NSStackView(views: [title, NSView(), modes, saveButton])
    header.orientation = .horizontal
    header.alignment = .centerY
    header.spacing = 8
    header.translatesAutoresizingMaskIntoConstraints = false

    configure(scroll: previewScroll, text: preview, editable: false)
    configure(scroll: sourceScroll, text: source, editable: true)
    source.delegate = self
    preview.onCommandClick = { [weak self] link in self?.onOpenLink?(link) }
    sourceScroll.isHidden = true
    applyZoom()
    applyPalette()

    addSubview(header)
    addSubview(previewScroll)
    addSubview(sourceScroll)
    NSLayoutConstraint.activate([
      header.topAnchor.constraint(equalTo: topAnchor, constant: 8),
      header.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      header.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
    ])
    for scroll in [previewScroll, sourceScroll] {
      NSLayoutConstraint.activate([
        scroll.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 6),
        scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
        scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
        scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
      ])
    }
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
    for text in [preview as NSTextView, source] {
      text.textColor = palette.text
      // The caret and the selection are the two things a text view draws in a
      // colour of its own, and both disappear against a themed background.
      text.insertionPointColor = palette.text
      text.selectedTextAttributes = [
        .backgroundColor: palette.selection, .foregroundColor: palette.text,
      ]
    }
    guard path != nil else { return }
    renderPreview()
  }

  /// Loads a file. The caller has already dealt with anything unsaved, because
  /// asking here would put the question in the middle of drawing.
  func open(path target: String) {
    do {
      let text = try core.text(ofFile: target)
      path = target
      title.stringValue = (target as NSString).lastPathComponent
      source.string = text
      isDirty = false
      renderPreview()
      show(preview: true)
    } catch {
      onError?(error)
    }
  }

  @objc private func save() {
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

  /// The view that should take the keyboard when this tab comes forward.
  var focusView: NSView {
    sourceScroll.isHidden ? (preview as NSTextView) : source
  }

  @objc private func modeChanged() {
    let wantsPreview = modes.selectedSegment == 0
    if wantsPreview {
      renderPreview()
    }
    show(preview: wantsPreview)
  }

  private func show(preview showPreview: Bool) {
    modes.selectedSegment = showPreview ? 0 : 1
    previewScroll.isHidden = !showPreview
    sourceScroll.isHidden = showPreview
    if !showPreview {
      window?.makeFirstResponder(source)
    }
  }

  private func renderPreview() {
    do {
      let blocks = try core.markdown(source.string)
      preview.textStorage?.setAttributedString(
        MarkdownAttributedText.build(blocks, zoom: zoom, colour: palette.text))
    } catch {
      onError?(error)
    }
  }

  /// Both halves are redrawn, not only the one on screen: the other is one
  /// segment click away and a document that changes size when it is looked at
  /// is worse than one that was the wrong size all along.
  private func applyZoom() {
    title.font = .systemFont(ofSize: zoom.size(12), weight: .medium)
    source.font = .monospacedSystemFont(ofSize: zoom.size(12), weight: .regular)
    guard path != nil else { return }
    renderPreview()
  }

  private func updateTitle() {
    guard let path else { return }
    let name = (path as NSString).lastPathComponent
    title.stringValue = isDirty ? "\(name) — edited" : name
  }
}

extension MarkdownDocumentView: NSTextViewDelegate {
  func textDidChange(_ notification: Notification) {
    guard !isDirty else { return }
    isDirty = true
    updateTitle()
  }
}

/// A read only text view that answers a command click on a link.
///
/// The gesture is command click rather than a plain one because the preview is
/// also where text is selected, and because a document is something being read
/// rather than a set of buttons. Everything else goes to the text view, so
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
