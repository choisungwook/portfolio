import AppKit
import AkbunTerminalCore

/// One window: the project tree on the left, the selected workspace's terminal
/// tabs in the middle, and that project's files on the right.
///
/// The sessions behind those tabs live in the core. What is kept here is the
/// arrangement around them — which workspace is open, which tab is on screen and
/// which view draws which session — because that is what a different terminal
/// engine would replace.
///
/// The three panes are split views rather than fixed widths, which is the whole
/// of "resizable and collapsible": dragging and hiding come with the class. The
/// sizes belong to the split view, so the widths here are placed once as divider
/// positions and the limits are answered by the delegate; a width constraint
/// would be a second opinion about the same number and one of the two has to
/// lose, which is what a divider that will not move looks like.
@MainActor
final class TerminalWindowController: NSWindowController, NSWindowDelegate, NSSplitViewDelegate {
  private let core: CoreBridge
  private let sidebar = ProjectSidebarView()
  private let tabBar = TerminalTabBarView()
  private let terminalArea = NSView()
  private let browser: FileBrowserView
  private let editor: MarkdownDocumentView
  private let panes = NSSplitView()
  private let centre = NSSplitView()
  private let placeholder = NSTextField(
    labelWithString: "Select a workspace on the left to open a terminal.")
  private var tabs = TerminalTabs()
  private var views: [UInt32: TerminalRendering] = [:]
  private var selection: (project: CoreProject, workspace: CoreWorkspace)?
  private var drain: Timer?
  private var detect: Timer?
  private(set) var themes: [CoreTheme] = []
  private(set) var themeName = CoreTheme.system
  /// Applies to every terminal in the window, and to the next one opened.
  private var fontSize: Double = 13
  private(set) var browsers = Browsers.none
  /// Called when a workspace finishes its work, so the app can say so outside
  /// its own window. Kept as a closure because the notification permission and
  /// the click that comes back belong to the application, not to one window.
  var onWorkspaceFinished: ((CoreProject, CoreWorkspace) -> Void)?

  init(core: CoreBridge) {
    self.core = core
    self.browser = FileBrowserView(core: core)
    self.editor = MarkdownDocumentView(core: core)

    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1100, height: 620),
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

    layOut(in: window)
    connect()
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  private func layOut(in window: NSWindow) {
    let content = NSView(frame: NSRect(x: 0, y: 0, width: 1100, height: 620))
    content.autoresizingMask = [.width, .height]
    window.contentView = content

    let terminalPane = NSView()
    for view in [tabBar, terminalArea] {
      view.translatesAutoresizingMaskIntoConstraints = false
      terminalPane.addSubview(view)
    }
    placeholder.textColor = .secondaryLabelColor
    placeholder.translatesAutoresizingMaskIntoConstraints = false
    terminalArea.addSubview(placeholder)
    NSLayoutConstraint.activate([
      tabBar.topAnchor.constraint(equalTo: terminalPane.topAnchor),
      tabBar.leadingAnchor.constraint(equalTo: terminalPane.leadingAnchor),
      tabBar.trailingAnchor.constraint(equalTo: terminalPane.trailingAnchor),
      terminalArea.topAnchor.constraint(equalTo: tabBar.bottomAnchor),
      terminalArea.bottomAnchor.constraint(equalTo: terminalPane.bottomAnchor),
      terminalArea.leadingAnchor.constraint(equalTo: terminalPane.leadingAnchor),
      terminalArea.trailingAnchor.constraint(equalTo: terminalPane.trailingAnchor),
      placeholder.centerXAnchor.constraint(equalTo: terminalArea.centerXAnchor),
      placeholder.centerYAnchor.constraint(equalTo: terminalArea.centerYAnchor),
    ])

    centre.isVertical = false
    centre.dividerStyle = .thin
    centre.delegate = self
    centre.addArrangedSubview(terminalPane)
    centre.addArrangedSubview(editor)
    editor.isHidden = true

    panes.isVertical = true
    panes.dividerStyle = .thin
    panes.delegate = self
    panes.translatesAutoresizingMaskIntoConstraints = false
    panes.addArrangedSubview(sidebar)
    panes.addArrangedSubview(centre)
    panes.addArrangedSubview(browser)
    content.addSubview(panes)
    NSLayoutConstraint.activate([
      panes.topAnchor.constraint(equalTo: content.topAnchor),
      panes.bottomAnchor.constraint(equalTo: content.bottomAnchor),
      panes.leadingAnchor.constraint(equalTo: content.leadingAnchor),
      panes.trailingAnchor.constraint(equalTo: content.trailingAnchor),
    ])
    panes.setHoldingPriority(.init(260), forSubviewAt: 0)
    panes.setHoldingPriority(.init(260), forSubviewAt: 2)
    // Starting widths. A width constraint cannot say this: it either loses to
    // the holding priority above and the pane opens at nothing, or it wins and
    // then puts the pane back where it was after every drag. Placing the
    // dividers says it once and leaves them free afterwards.
    content.layoutSubtreeIfNeeded()
    panes.setPosition(240, ofDividerAt: 0)
    panes.setPosition(panes.bounds.width - 260, ofDividerAt: 1)
  }

  /// How much of a pane has to be left. This is the delegate's answer rather
  /// than a constraint because a required constraint a drag cannot satisfy has
  /// to break for the drag to finish; a limit the split view knows about just
  /// stops the drag in the right place.
  private static let minimumPaneSize: CGFloat = 150

  func splitView(
    _ splitView: NSSplitView, constrainMinCoordinate proposedMinimumPosition: CGFloat,
    ofSubviewAt dividerIndex: Int
  ) -> CGFloat {
    // The coordinate is measured from the split view's own edge, so the first
    // divider's minimum is one pane in and the second is two.
    max(proposedMinimumPosition, Self.minimumPaneSize * CGFloat(dividerIndex + 1))
  }

  func splitView(
    _ splitView: NSSplitView, constrainMaxCoordinate proposedMaximumPosition: CGFloat,
    ofSubviewAt dividerIndex: Int
  ) -> CGFloat {
    let extent = splitView.isVertical ? splitView.bounds.width : splitView.bounds.height
    let panesAfter = CGFloat(splitView.arrangedSubviews.count - dividerIndex - 1)
    return min(proposedMaximumPosition, extent - Self.minimumPaneSize * panesAfter)
  }

  /// The reason these panes felt fixed. A thin divider draws as one point, and
  /// one point is not something a person can aim a mouse at, so the drag almost
  /// never started. The line stays thin; the part that answers the mouse grows.
  func splitView(
    _ splitView: NSSplitView, effectiveRect proposedEffectiveRect: NSRect,
    forDrawnRect drawnRect: NSRect, ofDividerAt dividerIndex: Int
  ) -> NSRect {
    proposedEffectiveRect.insetBy(
      dx: splitView.isVertical ? -4 : 0, dy: splitView.isVertical ? 0 : -4)
  }

  private func connect() {
    sidebar.onChooseFolder = { [weak self] in self?.chooseProjectFolder() }
    sidebar.onCreateEmptyProject = { [weak self] in self?.createEmptyProject() }
    sidebar.onCreateWorkspace = { [weak self] project in self?.createWorkspace(in: project) }
    sidebar.onSelectWorkspace = { [weak self] project, workspace in
      self?.selectWorkspace(project: project, workspace: workspace)
    }
    tabBar.onNew = { [weak self] in self?.openTab() }
    tabBar.onSelect = { [weak self] session in self?.selectTab(session) }
    tabBar.onClose = { [weak self] session in self?.closeTab(session) }
    browser.onOpenFile = { [weak self] entry in self?.open(entry) }
    browser.onError = { [weak self] error in self?.present(error, whileDoing: "That folder could not be read") }
    editor.onError = { [weak self] error in self?.present(error, whileDoing: "That file could not be used") }
    editor.onClose = { [weak self] in self?.hideDocument() }
  }

  /// Loads the tree and begins draining events. No shell starts until a
  /// workspace is chosen, because a tab belongs to one.
  func start() throws {
    let dataDirectory = try appDataDirectory()
    let state = try core.state(.loadState(directory: dataDirectory.path))
    // The rules directory is seeded by the core on the first run, so it is also
    // where a new agent is added: drop a file in and restart.
    try? core.expectOk(
      .loadRules(directory: dataDirectory.appendingPathComponent("agents", isDirectory: true).path))
    browsers = Browsers.installed()
    themes = (try? core.themes()) ?? []
    themeName = state.theme ?? CoreTheme.system
    sidebar.render(state)
    showActiveTab()

    // Roughly a frame. The core queues in the meantime, so a burst of output
    // arrives as one batch rather than one hop per read.
    drain = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
      // The timer fires on the run loop that scheduled it, which is this one.
      MainActor.assumeIsolated { self?.drainEvents() }
    }

    // Judging runs on its own clock, well away from the one above. Reading the
    // rules against every byte would stall the screen exactly when an agent is
    // at its noisiest, and a status nobody sees for two seconds costs nothing.
    detect = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated { self?.applyDetectedStatuses() }
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
    // Moving away from an edited file is the last chance to keep it, so the
    // question comes before anything on screen changes.
    guard editor.confirmDiscardingChanges() else { return }
    let changedProject = selection?.project.id != project.id
    selection = (project, workspace)
    // Finished means nobody has looked yet, and this is somebody looking.
    try? core.expectOk(.clearStatus(workspace: workspace.id))
    sidebar.setStatus(.idle, for: workspace.id)
    sidebar.select(workspace: workspace.id)
    if changedProject {
      hideDocument()
      browser.show(project: project)
    }
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
    terminal.apply(theme: currentTheme)
    terminal.fontSize = fontSize
    terminal.onCellClick = { [weak self] line, column, point in
      self?.offerURL(in: line, column: column, at: point, from: terminal.view)
    }
    let cwd = selection.project.path ?? FileManager.default.homeDirectoryForCurrentUser.path
    do {
      let grid = terminal.grid
      let session = try core.spawn(
        cwd: cwd, cols: grid.cols, rows: grid.rows, workspace: selection.workspace.id)
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

  // MARK: Files

  /// Markdown only. A code editor with highlighting is a different amount of
  /// work, and reading documents is what this pane is for.
  private func open(_ entry: CoreEntry) {
    let suffix = (entry.name as NSString).pathExtension.lowercased()
    guard suffix == "md" || suffix == "markdown" else { return }
    guard editor.confirmDiscardingChanges() else { return }
    editor.open(entry)
    guard editor.isHidden else { return }
    editor.isHidden = false
    centre.adjustSubviews()
    centre.setPosition(centre.frame.height * 0.55, ofDividerAt: 0)
  }

  private func hideDocument() {
    editor.isHidden = true
    centre.adjustSubviews()
  }

  // MARK: Zoom

  /// Steps the terminal font up or down, or back to the default at zero. The
  /// view reports its new cell grid on its own, which is what tells the shell
  /// on the other side that its window changed shape.
  func zoom(by steps: Double) {
    fontSize = steps == 0 ? 13 : min(36, max(7, fontSize + steps))
    for view in views.values {
      view.fontSize = fontSize
    }
  }

  // MARK: Links

  /// Offers what can be done with the URL under a click. Nothing happens when
  /// the core does not recognise one, so an ordinary click stays ordinary.
  private func offerURL(in line: String, column: Int, at point: NSPoint, from view: NSView) {
    guard let text = core.url(inLine: line, column: column), let url = URL(string: text) else {
      return
    }
    let menu = NSMenu(title: text)
    menu.addItem(withTitle: text, action: nil, keyEquivalent: "").isEnabled = false
    menu.addItem(.separator())
    menu.addItem(LinkItem(title: "Copy Link", url: url, browser: nil, copy: true))
    menu.addItem(LinkItem(title: "Open", url: url, browser: nil, copy: false))
    // With no browser installed there is nothing to choose between, so the
    // system default above is the whole menu.
    if !browsers.all.isEmpty {
      let choices = NSMenu(title: "Open With")
      for browser in browsers.all {
        choices.addItem(LinkItem(title: browser.name, url: url, browser: browser, copy: false))
      }
      let openWith = menu.addItem(withTitle: "Open With", action: nil, keyEquivalent: "")
      openWith.submenu = choices
    }
    menu.popUp(positioning: nil, at: point, in: view)
  }

  // MARK: Agent status

  /// Paints what the core judged and says so when work finished.
  private func applyDetectedStatuses() {
    guard let changed = try? core.detect() else { return }
    for state in changed {
      sidebar.setStatus(state.status, for: state.workspace)
      guard state.status == .completed, let found = find(workspace: state.workspace) else {
        continue
      }
      onWorkspaceFinished?(found.project, found.workspace)
    }
  }

  private func find(workspace id: UInt64) -> (project: CoreProject, workspace: CoreWorkspace)? {
    for project in sidebar.projects {
      if let workspace = project.workspaces.first(where: { $0.id == id }) {
        return (project, workspace)
      }
    }
    return nil
  }

  /// Brings a workspace on screen from outside the window, which is what a
  /// notification click asks for.
  func reveal(workspace id: UInt64) {
    guard let found = find(workspace: id) else { return }
    showWindow(nil)
    window?.makeKeyAndOrderFront(nil)
    selectWorkspace(project: found.project, workspace: found.workspace)
  }

  // MARK: Theme

  private var currentTheme: CoreTheme? {
    themes.first { $0.name == themeName }
  }

  /// Applies a theme to every open terminal and remembers it in the core, so the
  /// next launch and any second window agree on the colours.
  func applyTheme(named name: String) {
    do {
      let state = try core.state(.setTheme(name: name))
      themeName = state.theme ?? CoreTheme.system
      let theme = currentTheme
      for view in views.values {
        view.apply(theme: theme)
      }
    } catch {
      present(error, whileDoing: "That theme could not be applied")
    }
  }

  /// Folds the file pane away and back. Returns whether it is now hidden, which
  /// is what the menu item's own wording is.
  @discardableResult
  func toggleFileBrowser() -> Bool {
    browser.isHidden.toggle()
    panes.adjustSubviews()
    return browser.isHidden
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

  /// Everything but the terminal folds away: both side panes and the markdown
  /// pane under it. The terminal is the app.
  func splitView(_ splitView: NSSplitView, canCollapseSubview subview: NSView) -> Bool {
    subview === sidebar || subview === browser || subview === editor
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
    detect?.invalidate()
    detect = nil
    for session in tabs.allSessions {
      try? core.expectOk(.close(session: session))
    }
    tabs = TerminalTabs()
    views.removeAll()
  }
}


/// A menu entry that carries what it is for. A menu item's title is not a URL
/// and a browser is not a selector, so both ride on the item itself rather than
/// being looked up again when it is picked.
@MainActor
private final class LinkItem: NSMenuItem {
  private let url: URL
  private let browser: Browsers.Browser?
  private let copy: Bool

  init(title: String, url: URL, browser: Browsers.Browser?, copy: Bool) {
    self.url = url
    self.browser = browser
    self.copy = copy
    super.init(title: title, action: #selector(run), keyEquivalent: "")
    target = self
  }

  required init(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  @objc private func run() {
    guard !copy else {
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(url.absoluteString, forType: .string)
      return
    }
    Browsers.open(url, in: browser)
  }
}
