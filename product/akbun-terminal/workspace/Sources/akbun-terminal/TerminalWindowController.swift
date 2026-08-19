import AppKit
import AkbunTerminalCore

/// One window with one terminal in it.
///
/// The window owns no state worth keeping: the session lives in the core and the
/// bytes are drawn by whatever view is plugged in. Project and workspace trees
/// arrive in later milestones and will sit beside this pane, not inside it.
@MainActor
final class TerminalWindowController: NSWindowController {
  private let core: CoreBridge
  private let terminal: TerminalRendering
  private var session: UInt32?
  private var drain: Timer?

  init(core: CoreBridge) {
    self.core = core
    self.terminal = PlainTextTerminalView(frame: NSRect(x: 0, y: 0, width: 900, height: 560))

    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 900, height: 560),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = "akbun-terminal"
    // Set explicitly so the window does not flash white before the first draw.
    window.backgroundColor = .textBackgroundColor
    window.center()
    super.init(window: window)

    let content = NSView(frame: window.contentLayoutRect)
    terminal.view.frame = content.bounds
    terminal.view.autoresizingMask = [.width, .height]
    content.addSubview(terminal.view)
    window.contentView = content
    window.makeFirstResponder(terminal.view)
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  /// Starts the shell and begins draining events.
  func start() throws {
    terminal.onInput = { [weak self] bytes in
      guard let self, let session = self.session else { return }
      try? self.core.expectOk(.write(session: session, bytes: bytes))
    }
    terminal.onGridChange = { [weak self] cols, rows in
      guard let self, let session = self.session else { return }
      try? self.core.expectOk(.resize(session: session, cols: cols, rows: rows))
    }

    let grid = terminal.grid
    session = try core.spawn(cwd: FileManager.default.homeDirectoryForCurrentUser.path,
                             cols: grid.cols, rows: grid.rows)

    // Roughly a frame. The core queues in the meantime, so a burst of output
    // arrives as one batch rather than one hop per read.
    drain = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
      // The timer fires on the run loop that scheduled it, which is this one.
      MainActor.assumeIsolated { self?.drainEvents() }
    }
  }

  private func drainEvents() {
    for event in core.drainEvents() {
      switch event {
      case .output(_, let bytes):
        terminal.present(bytes: bytes)
      case .exited:
        terminal.presentExit()
        stopDraining()
      }
    }
  }

  func stopDraining() {
    drain?.invalidate()
    drain = nil
  }

  /// Ends the shell. The core also clears sessions when it is freed; doing it
  /// here means a closed window does not leave one running until quit.
  func closeSession() {
    stopDraining()
    if let session { try? core.expectOk(.close(session: session)) }
    session = nil
  }
}
