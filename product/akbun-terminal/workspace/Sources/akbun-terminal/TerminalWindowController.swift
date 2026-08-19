import AppKit
import AkbunTerminalCore

/// One project tree and terminal pane backed by state and sessions in the core.
@MainActor
final class TerminalWindowController: NSWindowController, NSWindowDelegate {
  private let core: CoreBridge
  private let terminal: TerminalRendering
  private let sidebar = ProjectSidebarView()
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
    window.delegate = self

    let content = NSView(frame: NSRect(x: 0, y: 0, width: 900, height: 560))
    content.autoresizingMask = [.width, .height]
    window.contentView = content
    sidebar.translatesAutoresizingMaskIntoConstraints = false
    terminal.view.translatesAutoresizingMaskIntoConstraints = false
    let divider = NSBox()
    divider.boxType = .separator
    divider.translatesAutoresizingMaskIntoConstraints = false
    content.addSubview(sidebar)
    content.addSubview(divider)
    content.addSubview(terminal.view)
    NSLayoutConstraint.activate([
      sidebar.topAnchor.constraint(equalTo: content.topAnchor),
      sidebar.bottomAnchor.constraint(equalTo: content.bottomAnchor),
      sidebar.leadingAnchor.constraint(equalTo: content.leadingAnchor),
      sidebar.widthAnchor.constraint(equalToConstant: 240),
      divider.topAnchor.constraint(equalTo: content.topAnchor),
      divider.bottomAnchor.constraint(equalTo: content.bottomAnchor),
      divider.leadingAnchor.constraint(equalTo: sidebar.trailingAnchor),
      divider.widthAnchor.constraint(equalToConstant: 1),
      terminal.view.topAnchor.constraint(equalTo: content.topAnchor),
      terminal.view.bottomAnchor.constraint(equalTo: content.bottomAnchor),
      terminal.view.leadingAnchor.constraint(equalTo: divider.trailingAnchor),
      terminal.view.trailingAnchor.constraint(equalTo: content.trailingAnchor),
    ])

    sidebar.onChooseFolder = { [weak self] in self?.chooseProjectFolder() }
    sidebar.onCreateEmptyProject = { [weak self] in self?.createEmptyProject() }
    sidebar.onCreateWorkspace = { [weak self] project in self?.createWorkspace(in: project) }
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  /// Starts the shell and begins draining events.
  func start() throws {
    let dataDirectory = try appDataDirectory()
    sidebar.render(try core.state(.loadState(directory: dataDirectory.path)))
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

  private func appDataDirectory() throws -> URL {
    let base = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    return base.appendingPathComponent("io.akbun.terminal", isDirectory: true)
  }

  private func chooseProjectFolder() {
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.allowsMultipleSelection = false
    guard panel.runModal() == .OK, let url = panel.url else { return }
    updateTree(.createProject(name: url.lastPathComponent, path: url.path))
  }

  private func createEmptyProject() {
    guard let name = askName(title: "New Empty Project", placeholder: "Project name") else { return }
    updateTree(.createProject(name: name, path: nil))
  }

  private func createWorkspace(in project: CoreProject) {
    let number = project.workspaces.count + 1
    guard let name = askName(title: "New Workspace", placeholder: "Workspace \(number)", initial: "Workspace \(number)")
    else { return }
    updateTree(.createWorkspace(project: project.id, name: name))
  }

  func windowDidBecomeKey(_ notification: Notification) {
    focusTerminal()
  }

  private func focusTerminal() {
    window?.makeFirstResponder(terminal.view)
  }

  private func askName(title: String, placeholder: String, initial: String = "") -> String? {
    let field = NSTextField(string: initial)
    field.placeholderString = placeholder
    field.frame = NSRect(x: 0, y: 0, width: 280, height: 24)
    let alert = NSAlert()
    alert.messageText = title
    alert.accessoryView = field
    alert.addButton(withTitle: "Create")
    alert.addButton(withTitle: "Cancel")
    guard alert.runModal() == .alertFirstButtonReturn else { return nil }
    let name = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
    return name.isEmpty ? nil : name
  }

  private func updateTree(_ command: CoreCommand) {
    do {
      sidebar.render(try core.state(command))
    } catch {
      let alert = NSAlert()
      alert.messageText = "Project tree could not be updated"
      alert.informativeText = error.localizedDescription
      alert.runModal()
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
