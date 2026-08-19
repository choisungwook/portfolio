import AppKit
import AkbunTerminalCore

/// The first terminal view: a monospaced text view that appends what the shell
/// writes and forwards what the user types.
///
/// It is not an emulator. Escape sequences arrive as text, so a full screen
/// program looks wrong, and that is accepted for now: this milestone exists to
/// prove the shell talks to the core, and the seam above lets a real engine
/// replace this file without touching anything else.
final class PlainTextTerminalView: NSView, TerminalRendering {
  var onInput: (([UInt8]) -> Void)?
  var onGridChange: ((UInt16, UInt16) -> Void)?

  var view: NSView { self }
  var focusView: NSView { textView }

  private let scrollView = NSScrollView()
  private let textView = TerminalTextView()
  private let font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
  private var pendingBytes: [UInt8] = []
  private var lastGrid: (cols: UInt16, rows: UInt16) = (80, 24)

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    setUp()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setUp()
  }

  private func setUp() {
    textView.isEditable = false
    textView.isSelectable = true
    textView.drawsBackground = false
    textView.font = font
    textView.textColor = .textColor
    textView.autoresizingMask = [.width]
    textView.onTerminalInput = { [weak self] bytes in self?.onInput?(bytes) }

    scrollView.documentView = textView
    scrollView.hasVerticalScroller = true
    scrollView.drawsBackground = false
    scrollView.translatesAutoresizingMaskIntoConstraints = false
    addSubview(scrollView)
    NSLayoutConstraint.activate([
      scrollView.topAnchor.constraint(equalTo: topAnchor),
      scrollView.bottomAnchor.constraint(equalTo: bottomAnchor),
      scrollView.leadingAnchor.constraint(equalTo: leadingAnchor),
      scrollView.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
  }

  var grid: (cols: UInt16, rows: UInt16) { lastGrid }

  override var acceptsFirstResponder: Bool { true }

  override func keyDown(with event: NSEvent) {
    if event.modifierFlags.intersection(.deviceIndependentFlagsMask).contains(.command) {
      super.keyDown(with: event)
      return
    }
    guard let characters = event.characters, !characters.isEmpty else { return }
    onInput?(Array(characters.utf8))
  }

  override func layout() {
    super.layout()
    let cell = ("M" as NSString).size(withAttributes: [.font: font])
    guard cell.width > 0, cell.height > 0 else { return }
    let cols = UInt16(max(20, Int(bounds.width / cell.width)))
    let rows = UInt16(max(5, Int(bounds.height / cell.height)))
    guard (cols, rows) != lastGrid else { return }
    lastGrid = (cols, rows)
    onGridChange?(cols, rows)
  }

  func present(bytes: [UInt8]) {
    // A multi byte character can be split across two reads, so decoding waits
    // until the bytes it holds are valid text.
    pendingBytes.append(contentsOf: bytes)
    guard let text = String(bytes: pendingBytes, encoding: .utf8) else { return }
    pendingBytes.removeAll(keepingCapacity: true)
    append(text)
  }

  func presentExit() {
    append("\n[process exited]\n")
  }

  private func append(_ text: String) {
    let wasAtBottom = isScrolledToBottom
    textView.textStorage?.append(
      NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: NSColor.textColor]))
    // Only follow the output when the user was already at the bottom, so reading
    // back through a build log is not yanked away by the next line.
    if wasAtBottom { textView.scrollToEndOfDocument(nil) }
  }

  private var isScrolledToBottom: Bool {
    let visible = scrollView.contentView.bounds
    guard let documentHeight = scrollView.documentView?.bounds.height else { return true }
    return visible.maxY >= documentHeight - font.pointSize * 2
  }
}

private final class TerminalTextView: NSTextView {
  var onTerminalInput: (([UInt8]) -> Void)?

  override var acceptsFirstResponder: Bool { true }

  override func mouseDown(with event: NSEvent) {
    window?.makeFirstResponder(self)
    super.mouseDown(with: event)
  }

  override func keyDown(with event: NSEvent) {
    if event.modifierFlags.intersection(.deviceIndependentFlagsMask).contains(.command) {
      super.keyDown(with: event)
      return
    }
    guard let characters = event.characters, !characters.isEmpty else { return }
    onTerminalInput?(Array(characters.utf8))
  }

  override func paste(_ sender: Any?) {
    guard let text = NSPasteboard.general.string(forType: .string) else { return }
    onTerminalInput?(Array(text.utf8))
  }
}
