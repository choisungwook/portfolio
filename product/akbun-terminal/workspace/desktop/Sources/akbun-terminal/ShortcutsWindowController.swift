import AppKit
import AkbunTerminalCore

/// Settings › Shortcuts: every menu command and the key it runs on.
///
/// The list is the core's, so this window cannot show a command the menu does
/// not have or miss one it does. Recording is a local event monitor rather than
/// a first responder trick: while a row is recording, the next key press belongs
/// to that row and to nothing else, which is the only way ⌘Q can be put on
/// something without quitting the app on the way past.
///
/// A key another command already has is refused by the core. The message it
/// gives is shown as it is, because it names the command that has it, which is
/// the one thing somebody in this window needs to know.
@MainActor
final class ShortcutsWindowController: NSWindowController, NSWindowDelegate {
  /// Something changed, so the menu bar has to be built again. The window does
  /// not touch the menu itself: one place builds it, from the core.
  var onChange: (() -> Void)?

  private let core: CoreBridge
  private let rows = NSStackView()
  private let message = NSTextField(labelWithString: "")
  private var recording: Any?
  private var recordingCommand: String?

  init(core: CoreBridge) {
    self.core = core
    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 460, height: 520),
      styleMask: [.titled, .closable],
      backing: .buffered,
      defer: false)
    window.title = "Shortcuts"
    super.init(window: window)
    window.delegate = self
    layOut(in: window)
    reload()
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  /// A monitor that outlives the window would swallow every keystroke in the
  /// app, so closing the window ends any recording that was still running.
  func windowWillClose(_ notification: Notification) {
    endRecording()
  }

  private func layOut(in window: NSWindow) {
    rows.orientation = .vertical
    rows.alignment = .leading
    rows.spacing = 6
    rows.translatesAutoresizingMaskIntoConstraints = false

    let scroll = NSScrollView()
    scroll.documentView = rows
    scroll.hasVerticalScroller = true
    scroll.drawsBackground = false
    scroll.translatesAutoresizingMaskIntoConstraints = false

    message.textColor = .secondaryLabelColor
    message.lineBreakMode = .byWordWrapping
    message.translatesAutoresizingMaskIntoConstraints = false

    let restore = NSButton(
      title: "Restore Defaults", target: self, action: #selector(restoreDefaults))
    restore.translatesAutoresizingMaskIntoConstraints = false

    let content = NSView()
    content.addSubview(scroll)
    content.addSubview(message)
    content.addSubview(restore)
    window.contentView = content
    NSLayoutConstraint.activate([
      scroll.topAnchor.constraint(equalTo: content.topAnchor, constant: 12),
      scroll.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 12),
      scroll.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -12),
      rows.leadingAnchor.constraint(equalTo: scroll.contentView.leadingAnchor),
      rows.topAnchor.constraint(equalTo: scroll.contentView.topAnchor),
      rows.widthAnchor.constraint(equalTo: scroll.widthAnchor, constant: -4),
      message.topAnchor.constraint(equalTo: scroll.bottomAnchor, constant: 8),
      message.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 12),
      message.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -12),
      restore.topAnchor.constraint(equalTo: message.bottomAnchor, constant: 8),
      restore.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 12),
      restore.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -12),
    ])
  }

  private func reload() {
    for view in rows.arrangedSubviews {
      rows.removeArrangedSubview(view)
      view.removeFromSuperview()
    }
    let shortcuts = (try? core.shortcuts()) ?? []
    var menu = ""
    for shortcut in shortcuts {
      if shortcut.menu != menu {
        menu = shortcut.menu
        let header = NSTextField(labelWithString: menu)
        header.font = .systemFont(ofSize: 11, weight: .semibold)
        header.textColor = .secondaryLabelColor
        rows.addArrangedSubview(header)
      }
      rows.addArrangedSubview(row(for: shortcut))
    }
  }

  private func row(for shortcut: CoreShortcut) -> NSView {
    let title = NSTextField(labelWithString: shortcut.title)
    let key = NSButton(
      title: recordingCommand == shortcut.command
        ? "Press a key…" : ShortcutKey.display(shortcut.key),
      target: self, action: #selector(record))
    key.bezelStyle = .rounded
    key.identifier = NSUserInterfaceItemIdentifier(shortcut.command)
    // A row that has been changed says so, and offers the way back.
    let restore = NSButton(title: "↺", target: self, action: #selector(restoreOne))
    restore.bezelStyle = .accessoryBarAction
    restore.identifier = key.identifier
    restore.isHidden = shortcut.key == shortcut.defaultKey
    restore.toolTip = "Back to \(ShortcutKey.display(shortcut.defaultKey))"

    let row = NSStackView(views: [title, NSView(), key, restore])
    row.orientation = .horizontal
    row.alignment = .centerY
    row.spacing = 8
    NSLayoutConstraint.activate([
      title.widthAnchor.constraint(greaterThanOrEqualToConstant: 200),
      key.widthAnchor.constraint(greaterThanOrEqualToConstant: 110),
    ])
    return row
  }

  @objc private func record(_ sender: NSButton) {
    guard let command = sender.identifier?.rawValue else { return }
    endRecording()
    recordingCommand = command
    sender.title = "Press a key…"
    message.stringValue = "Escape cancels. Delete puts the command back on its default."
    recording = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
      MainActor.assumeIsolated {
        self?.captured(event)
      }
      // Swallowed, so the keystroke being recorded does not also run whatever
      // it is currently on.
      return nil
    }
  }

  private func captured(_ event: NSEvent) {
    guard let command = recordingCommand else { return }
    endRecording()
    switch event.keyCode {
    case 53:  // Escape
      reload()
      message.stringValue = ""
      return
    case 51, 117:  // Delete and forward delete
      apply(command: command, key: "")
      return
    default:
      break
    }
    var modifiers = ShortcutKey.Modifiers()
    if event.modifierFlags.contains(.command) { modifiers.insert(.command) }
    if event.modifierFlags.contains(.control) { modifiers.insert(.control) }
    if event.modifierFlags.contains(.option) { modifiers.insert(.option) }
    if event.modifierFlags.contains(.shift) { modifiers.insert(.shift) }
    // `charactersIgnoringModifiers` is the key that was pressed rather than what
    // it typed, which is what makes ⌥ combinations readable at all.
    let character = event.charactersIgnoringModifiers ?? ""
    guard let key = ShortcutKey.describe(character: character, modifiers: modifiers) else {
      reload()
      message.stringValue = "A shortcut has to hold down ⌘, ⌃ or ⌥."
      return
    }
    apply(command: command, key: key)
  }

  private func apply(command: String, key: String) {
    do {
      try core.setShortcut(command: command, key: key)
      message.stringValue = ""
      onChange?()
    } catch {
      message.stringValue = error.localizedDescription
    }
    reload()
  }

  private func endRecording() {
    if let recording {
      NSEvent.removeMonitor(recording)
    }
    recording = nil
    recordingCommand = nil
  }

  @objc private func restoreOne(_ sender: NSButton) {
    guard let command = sender.identifier?.rawValue else { return }
    apply(command: command, key: "")
  }

  @objc private func restoreDefaults() {
    do {
      try core.resetShortcuts()
      message.stringValue = ""
      onChange?()
    } catch {
      message.stringValue = error.localizedDescription
    }
    reload()
  }
}
