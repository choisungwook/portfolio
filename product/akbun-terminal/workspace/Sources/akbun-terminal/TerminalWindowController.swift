import AppKit
import AkbunTerminalCore

/// One window: the project tree on the left, and the selected workspace's
/// terminal tabs on the right.
///
/// The sessions behind those tabs live in the core. What is kept here is the
/// arrangement around them — which workspace is open, which tab is on screen and
/// which view draws which session — because that is what a different terminal
/// engine would replace.
@MainActor
final class TerminalWindowController: NSWindowController, NSWindowDelegate {
  private let core: CoreBridge
  private let sidebar = ProjectSidebarView()
  private let tabBar = TerminalTabBarView()
  private let terminalArea = NSView()
  private let placeholder = NSTextField(
    labelWithString: "Select a workspace on the left to open a terminal.")
  private var tabs = TerminalTabs()
  private var views: [UInt32: TerminalRendering] = [:]
  private var selection: (project: CoreProject, workspace: CoreWorkspace)?
  private var drain: Timer?

  init(core: CoreBridge) {
    self.core = core

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
    tabBar.translatesAutoresizingMaskIntoConstraints = false
    terminalArea.translatesAutoresizingMaskIntoConstraints = false
    placeholder.textColor = .secondaryLabelColor
    placeholder.translatesAutoresizingMaskIntoConstraints = false
    let divider = NSBox()
    divider.boxType = .separator
    divider.translatesAutoresizingMaskIntoConstraints = false
    content.addSubview(sidebar)
    content.addSubview(divider)
    content.addSubview(tabBar)
    content.addSubview(terminalArea)
    terminalArea.addSubview(placeholder)
    NSLayoutConstraint.activate([
      sidebar.topAnchor.constraint(equalTo: content.topAnchor),
      sidebar.bottomAnchor.constraint(equalTo: content.bottomAnchor),
      sidebar.leadingAnchor.constraint(equalTo: content.leadingAnchor),
      sidebar.widthAnchor.constraint(equalToConstant: 240),
      divider.topAnchor.constraint(equalTo: content.topAnchor),
      divider.bottomAnchor.constraint(equalTo: content.bottomAnchor),
      divider.leadingAnchor.constraint(equalTo: sidebar.trailingAnchor),
      divider.widthAnchor.constraint(equalToConstant: 1),
      tabBar.topAnchor.constraint(equalTo: content.topAnchor),
      tabBar.leadingAnchor.constraint(equalTo: divider.trailingAnchor),
      tabBar.trailingAnchor.constraint(equalTo: content.trailingAnchor),
      terminalArea.topAnchor.constraint(equalTo: tabBar.bottomAnchor),
      terminalArea.bottomAnchor.constraint(equalTo: content.bottomAnchor),
      terminalArea.leadingAnchor.constraint(equalTo: divider.trailingAnchor),
      terminalArea.trailingAnchor.constraint(equalTo: content.trailingAnchor),
      placeholder.centerXAnchor.constraint(equalTo: terminalArea.centerXAnchor),
      placeholder.centerYAnchor.constraint(equalTo: terminalArea.centerYAnchor),
    ])

    sidebar.onChooseFolder = { [weak self] in self?.chooseProjectFolder() }
    sidebar.onCreateEmptyProject = { [weak self] in self?.createEmptyProject() }
    sidebar.onCreateWorkspace = { [weak self] project in self?.createWorkspace(in: project) }
    sidebar.onSelectWorkspace = { [weak self] project, workspace in
      self?.selectWorkspace(project: project, workspace: workspace)
    }
    tabBar.onNew = { [weak self] in self?.openTab() }
    tabBar.onSelect = { [weak self] session in self?.selectTab(session) }
    tabBar.onClose = { [weak self] session in self?.closeTab(session) }
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  /// Loads the tree and begins draining events. No shell starts until a
  /// workspace is chosen, because a tab belongs to one.
  func start() throws {
    let dataDirectory = try appDataDirectory()
    let state = try core.state(.loadState(directory: dataDirectory.path))
    sidebar.render(state)
    showActiveTab()

    // Roughly a frame. The core queues in the meantime, so a burst of output
    // arrives as one batch rather than one hop per read.
    drain = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
      // The timer fires on the run loop that scheduled it, which is this one.
      MainActor.assumeIsolated { self?.drainEvents() }
    }

    // Opening on the first workspace saves the click that every launch would
    // otherwise start with.
    if let project = state.projects.first(where: { !$0.workspaces.isEmpty }),
      let workspace = project.workspaces.first
    {
      selectWorkspace(project: project, workspace: workspace)
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

  // MARK: Tabs

  private func selectWorkspace(project: CoreProject, workspace: CoreWorkspace) {
    selection = (project, workspace)
    sidebar.select(workspace: workspace.id)
    if tabs.tabs(in: workspace.id).isEmpty {
      openTab()
    } else {
      showActiveTab()
    }
  }

  /// Starts a shell for the selected workspace in the project's folder.
  private func openTab() {
    guard let selection else { return }
    let terminal = SwiftTermTerminalView(frame: terminalArea.bounds)
    let cwd = selection.project.path ?? FileManager.default.homeDirectoryForCurrentUser.path
    do {
      let grid = terminal.grid
      let session = try core.spawn(cwd: cwd, cols: grid.cols, rows: grid.rows)
      terminal.onInput = { [weak self] bytes in
        try? self?.core.expectOk(.write(session: session, bytes: bytes))
      }
      terminal.onGridChange = { [weak self] cols, rows in
        try? self?.core.expectOk(.resize(session: session, cols: cols, rows: rows))
      }
      views[session] = terminal
      tabs.add(session: session, to: selection.workspace.id)
      showActiveTab()
    } catch {
      present(error, whileDoing: "The shell could not start")
    }
  }

  private func selectTab(_ session: UInt32) {
    guard let workspace = selection?.workspace.id else { return }
    tabs.select(session: session, in: workspace)
    showActiveTab()
  }

  private func closeTab(_ session: UInt32) {
    try? core.expectOk(.close(session: session))
    tabs.close(session: session)
    views.removeValue(forKey: session)
    showActiveTab()
  }

  /// Puts the active tab's view on screen and redraws the strip above it.
  private func showActiveTab() {
    guard let workspace = selection?.workspace.id else {
      tabBar.render(tabs: [], active: nil)
      tabBar.show(false)
      placeholder.isHidden = false
      return
    }
    tabBar.show(true)
    let active = tabs.activeSession(in: workspace)
    tabBar.render(tabs: tabs.tabs(in: workspace), active: active)

    let wanted = active.flatMap { views[$0] }?.view
    for subview in terminalArea.subviews where subview !== placeholder && subview !== wanted {
      subview.removeFromSuperview()
    }
    placeholder.isHidden = wanted != nil
    guard let wanted, wanted.superview !== terminalArea else {
      window?.makeFirstResponder(active.flatMap { views[$0] }?.focusView)
      return
    }
    wanted.translatesAutoresizingMaskIntoConstraints = false
    terminalArea.addSubview(wanted)
    NSLayoutConstraint.activate([
      wanted.topAnchor.constraint(equalTo: terminalArea.topAnchor),
      wanted.bottomAnchor.constraint(equalTo: terminalArea.bottomAnchor),
      wanted.leadingAnchor.constraint(equalTo: terminalArea.leadingAnchor),
      wanted.trailingAnchor.constraint(equalTo: terminalArea.trailingAnchor),
    ])
    window?.makeFirstResponder(active.flatMap { views[$0] }?.focusView)
  }

  // MARK: Tree

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

  private func updateTree(_ command: CoreCommand) {
    do {
      let state = try core.state(command)
      sidebar.render(state)
      // The selected project is a value copied out of the previous state, so it
      // is refreshed here or the next tab would open against a stale folder.
      if let current = selection,
        let project = state.projects.first(where: { $0.id == current.project.id }),
        let workspace = project.workspaces.first(where: { $0.id == current.workspace.id })
      {
        selection = (project, workspace)
      }
      sidebar.select(workspace: selection?.workspace.id)
    } catch {
      present(error, whileDoing: "Project tree could not be updated")
    }
  }

  func windowDidBecomeKey(_ notification: Notification) {
    showActiveTab()
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

  private func present(_ error: Error, whileDoing what: String) {
    let alert = NSAlert()
    alert.messageText = what
    alert.informativeText = error.localizedDescription
    alert.runModal()
  }

  private func drainEvents() {
    for event in core.drainEvents() {
      switch event {
      case .output(let session, let bytes):
        views[session]?.present(bytes: bytes)
      case .exited(let session):
        // The tab stays until it is closed, so what the shell said before it
        // ended is still readable. Other tabs keep running, which is why the
        // drain timer lives as long as the window rather than the session.
        views[session]?.presentExit()
      }
    }
  }

  /// Ends every shell. The core also clears sessions when it is freed; doing it
  /// here means a closed window does not leave one running until quit.
  func closeSessions() {
    drain?.invalidate()
    drain = nil
    for session in tabs.allSessions {
      try? core.expectOk(.close(session: session))
    }
    tabs = TerminalTabs()
    views.removeAll()
  }
}
