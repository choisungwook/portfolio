import AppKit
import AkbunTerminalCore

/// A markdown file, below the terminal.
///
/// One area with two modes rather than a split preview: the terminal owns the
/// window, so what is left is already narrow and halving it again would leave
/// two columns of nothing. The rendered side is an attributed string in a plain
/// text view, which is why no HTML and no second web view appear anywhere here.
@MainActor
final class MarkdownDocumentView: NSView {
  var onClose: (() -> Void)?
  var onError: ((Error) -> Void)?

  private(set) var path: String?
  private(set) var isDirty = false

  private let core: CoreBridge
  private let title = NSTextField(labelWithString: "")
  private let modes = NSSegmentedControl(
    labels: ["Preview", "Source"], trackingMode: .selectOne, target: nil, action: nil)
  private let saveButton = NSButton(title: "Save", target: nil, action: nil)
  private let preview = NSTextView()
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
    layer?.backgroundColor = NSColor.textBackgroundColor.cgColor

    title.font = .systemFont(ofSize: 12, weight: .medium)
    title.lineBreakMode = .byTruncatingMiddle
    modes.selectedSegment = 0
    modes.target = self
    modes.action = #selector(modeChanged)
    saveButton.target = self
    saveButton.action = #selector(save)
    saveButton.bezelStyle = .accessoryBarAction
    saveButton.keyEquivalent = "s"
    saveButton.keyEquivalentModifierMask = .command
    let close = NSButton(
      image: NSImage(systemSymbolName: "xmark", accessibilityDescription: "Close")!,
      target: self, action: #selector(closeDocument))
    close.bezelStyle = .accessoryBarAction

    let header = NSStackView(views: [title, NSView(), modes, saveButton, close])
    header.orientation = .horizontal
    header.alignment = .centerY
    header.spacing = 8
    header.translatesAutoresizingMaskIntoConstraints = false

    configure(scroll: previewScroll, text: preview, editable: false)
    configure(scroll: sourceScroll, text: source, editable: true)
    source.delegate = self
    source.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
    sourceScroll.isHidden = true

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

  /// Loads a file. The caller has already dealt with anything unsaved, because
  /// asking here would put the question in the middle of drawing.
  func open(_ entry: CoreEntry) {
    do {
      let text = try core.text(ofFile: entry.path)
      path = entry.path
      title.stringValue = entry.name
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

  @objc private func closeDocument() {
    guard confirmDiscardingChanges() else { return }
    path = nil
    isDirty = false
    source.string = ""
    preview.string = ""
    onClose?()
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
      preview.textStorage?.setAttributedString(MarkdownAttributedText.build(blocks))
    } catch {
      onError?(error)
    }
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
