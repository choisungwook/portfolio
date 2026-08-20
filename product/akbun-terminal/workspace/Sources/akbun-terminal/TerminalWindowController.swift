import AppKit
import AkbunTerminalCore

/// One window: the project tree on the left, the selected workspace's tabs in
/// the middle, and that project's files on the right.
///
/// The sessions behind those tabs live in the core. What is kept here is the
/// arrangement around them — which workspace is open, which tab is on screen and
/// which view draws which tab — because that is what a different terminal engine
/// would replace.
///
/// A tab is a shell or a file, and both fill the same area. The document used to
/// be a pane under the terminal, which meant reading anything cost half the
/// terminal for as long as it stayed open; as a tab it takes the whole area
/// while it is being read and none of it afterwards.
///
/// The panes are split views rather than fixed widths, which is the whole of
/// "resizable and collapsible": dragging and hiding come with the class. The
/// sizes belong to the split view, so the widths here are placed once as divider
/// positions and the limits are answered by the delegate; a width constraint
/// would be a second opinion about the same number and one of the two has to
/// lose, which is what a divider that will not move looks like.
@MainActor
final class TerminalWindowController: NSWindowController, NSWindowDelegate, NSSplitViewDelegate {
  private let core: CoreBridge
  private let sidebar = ProjectSidebarView()
  private let tabBar = TerminalTabBarView()
  private let contentArea = NSView()
  private let browser: FileBrowserView
  private let panes = NSSplitView()
  private let placeholder = NSTextField(
    labelWithString: "Select a workspace on the left to open a terminal.")
  private var tabs = TerminalTabs()
  private var views: [UInt32: TerminalRendering] = [:]
  private var documents: [DocumentKey: DocumentView] = [:]
  private var selection: (project: CoreProject, workspace: CoreWorkspace)?
  private var drain: Timer?
  private var detect: Timer?
  private var watchGit: Timer?
  private(set) var themes: [CoreTheme] = []
  private(set) var themeName = CoreTheme.system
  /// Every colour the window draws with. The theme used to reach the terminal
  /// alone, which left a system coloured sidebar, tab strip and file list around
  /// it; one palette handed to every view is what makes the window one surface.
  private var palette = Palette.system
  /// Applies to every pane in the window, and to the next terminal opened.
  private var zoomLevel = Zoom()
  private(set) var browsers = Browsers.none
  /// Called when a workspace finishes its work, so the app can say so outside
  /// its own window. Kept as a closure because the notification permission and
  /// the click that comes back belong to the application, not to one window.
  var onWorkspaceFinished: ((CoreProject, CoreWorkspace) -> Void)?

  /// A document belongs to the strip that carries it, so the same file reached
  /// from two workspaces is two tabs with a view each rather than one buffer
  /// shared between them.
  private struct DocumentKey: Hashable {
    let workspace: UInt64
    let path: String
  }

  init(core: CoreBridge) {
    self.core = core
    self.browser = FileBrowserView(core: core)

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

    let workArea = NSView()
    for view in [tabBar, contentArea] {
      view.translatesAutoresizingMaskIntoConstraints = false
      workArea.addSubview(view)
    }
    placeholder.textColor = .secondaryLabelColor
    placeholder.translatesAutoresizingMaskIntoConstraints = false
    contentArea.addSubview(placeholder)
    NSLayoutConstraint.activate([
      tabBar.topAnchor.constraint(equalTo: workArea.topAnchor),
      tabBar.leadingAnchor.constraint(equalTo: workArea.leadingAnchor),
      tabBar.trailingAnchor.constraint(equalTo: workArea.trailingAnchor),
      contentArea.topAnchor.constraint(equalTo: tabBar.bottomAnchor),
      contentArea.bottomAnchor.constraint(equalTo: workArea.bottomAnchor),
      contentArea.leadingAnchor.constraint(equalTo: workArea.leadingAnchor),
      contentArea.trailingAnchor.constraint(equalTo: workArea.trailingAnchor),
      placeholder.centerXAnchor.constraint(equalTo: contentArea.centerXAnchor),
      placeholder.centerYAnchor.constraint(equalTo: contentArea.centerYAnchor),
    ])

    panes.isVertical = true
    panes.dividerStyle = .thin
    panes.delegate = self
    panes.translatesAutoresizingMaskIntoConstraints = false
    panes.addArrangedSubview(sidebar)
    panes.addArrangedSubview(workArea)
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
    sidebar.onRenameProject = { [weak self] project in self?.renameProject(project) }
    sidebar.onDeleteProject = { [weak self] project in self?.deleteProject(project) }
    sidebar.onRenameWorkspace = { [weak self] _, workspace in self?.renameWorkspace(workspace) }
    sidebar.onDeleteWorkspace = { [weak self] _, workspace in self?.deleteWorkspace(workspace) }
    tabBar.onNew = { [weak self] in self?.openTab() }
    tabBar.onSelect = { [weak self] content in self?.selectTab(content) }
    tabBar.onClose = { [weak self] content in self?.closeTab(content) }
    browser.onOpenFile = { [weak self] entry in self?.open(entry) }
    browser.onError = { [weak self] error in self?.present(error, whileDoing: "That folder could not be read") }
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
    applyPalette()
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

    // What git makes of the files changes on the shell's clock, not on anyone
    // clicking refresh, so it is asked for on its own timer. Slower than the
    // judging above because it runs a process, and it only repaints: the tree
    // itself is left alone, so nothing a reader opened closes underneath them.
    watchGit = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated { self?.browser.refreshGitStatus() }
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
    let changedProject = selection?.project.id != project.id
    selection = (project, workspace)
    // Finished means nobody has looked yet, and this is somebody looking.
    try? core.expectOk(.clearStatus(workspace: workspace.id))
    sidebar.setStatus(.idle, for: workspace.id)
    sidebar.select(workspace: workspace.id)
    if changedProject {
      browser.show(project: project)
    } else {
      // Same folder, but the shell in the workspace just left may have changed
      // what is in it.
      browser.refreshGitStatus()
    }
    if tabs.tabs(in: workspace.id).isEmpty {
      openTab()
    } else {
      showActiveTab()
    }
  }

  /// Starts a shell for the selected workspace in the project's folder.
  func openTab() {
    guard let selection else { return }
    let terminal = SwiftTermTerminalView(frame: contentArea.bounds)
    terminal.apply(theme: currentTheme)
    terminal.fontSize = zoomLevel.terminalFontSize
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

  private func selectTab(_ content: TerminalTabs.Content) {
    guard let workspace = selection?.workspace.id else { return }
    tabs.select(content, in: workspace)
    showActiveTab()
  }

  private func closeTab(_ content: TerminalTabs.Content) {
    // The tab being closed is one of the strip on screen, so the workspace comes
    // from the selection. Looking it up from the content would find whichever
    // workspace holds that path first, which is another workspace's tab as often
    // as this one's.
    guard let workspace = selection?.workspace.id else { return }
    switch content {
    case .shell(let session):
      try? core.expectOk(.close(session: session))
      views.removeValue(forKey: session)
    case .document(let path):
      let key = DocumentKey(workspace: workspace, path: path)
      // Closing is the last chance to keep an edit, so the question comes before
      // the tab goes.
      guard documents[key]?.confirmDiscardingChanges() ?? true else { return }
      documents.removeValue(forKey: key)
    }
    tabs.close(content, in: workspace)
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
    let active = tabs.active(in: workspace)
    tabBar.render(tabs: tabs.tabs(in: workspace), active: active)

    let shown = active.flatMap { view(for: $0, in: workspace) }
    for subview in contentArea.subviews where subview !== placeholder && subview !== shown?.view {
      subview.removeFromSuperview()
    }
    placeholder.isHidden = shown != nil
    guard let shown else {
      // The view that had the keyboard has just left the window, so the window
      // is told rather than left holding a responder that is no longer in it.
      window?.makeFirstResponder(nil)
      return
    }
    guard shown.view.superview !== contentArea else {
      window?.makeFirstResponder(shown.focus)
      return
    }
    shown.view.translatesAutoresizingMaskIntoConstraints = false
    contentArea.addSubview(shown.view)
    NSLayoutConstraint.activate([
      shown.view.topAnchor.constraint(equalTo: contentArea.topAnchor),
      shown.view.bottomAnchor.constraint(equalTo: contentArea.bottomAnchor),
      shown.view.leadingAnchor.constraint(equalTo: contentArea.leadingAnchor),
      shown.view.trailingAnchor.constraint(equalTo: contentArea.trailingAnchor),
    ])
    window?.makeFirstResponder(shown.focus)
  }

  /// What draws a tab, and what inside it should take the keyboard.
  private func view(for content: TerminalTabs.Content, in workspace: UInt64)
    -> (view: NSView, focus: NSView)?
  {
    switch content {
    case .shell(let session):
      guard let terminal = views[session] else { return nil }
      return (terminal.view, terminal.focusView)
    case .document(let path):
      guard let document = documents[DocumentKey(workspace: workspace, path: path)] else {
        return nil
      }
      return (document, document.focusView)
    }
  }

  // MARK: Files

  /// Every file, not only markdown. The pane on the right lists a whole
  /// repository, and a browser where nine names in ten do nothing when clicked
  /// is a list rather than a browser. What a file looks like is the core's
  /// answer: markdown is rendered and everything else is coloured.
  private func open(_ entry: CoreEntry) {
    openDocument(at: entry.path)
  }

  private func openDocument(at path: String) {
    guard let selection else { return }
    let key = DocumentKey(workspace: selection.workspace.id, path: path)
    if documents[key] == nil {
      let document = DocumentView(core: core)
      document.zoom = zoomLevel
      document.palette = palette
      document.onError = { [weak self] error in
        self?.present(error, whileDoing: "That file could not be used")
      }
      document.onOpenLink = { [weak self] link in self?.follow(link, from: path) }
      document.open(path: path)
      // A file that could not be read has already said so, and an empty tab
      // would be the second thing to go wrong.
      guard document.path != nil else { return }
      documents[key] = document
    }
    tabs.add(
      document: path, title: (path as NSString).lastPathComponent, to: selection.workspace.id)
    showActiveTab()
  }

  /// Turns the file on screen between reading and editing. Nothing happens on
  /// a shell tab: a terminal is always editable and has no second mode to go to.
  func toggleEditMode() {
    activeDocument?.toggleEditing()
  }

  /// The document tab on screen, or nothing when the tab is a shell. Every menu
  /// command that only means something for a file goes through here, so a
  /// keystroke pressed over a terminal is quietly nothing rather than an error.
  private var activeDocument: DocumentView? {
    guard let workspace = selection?.workspace.id,
      case .document(let path)? = tabs.active(in: workspace)
    else { return nil }
    return documents[DocumentKey(workspace: workspace, path: path)]
  }

  func saveActiveDocument() {
    activeDocument?.save()
  }

  func beginFind() {
    activeDocument?.beginFind()
  }

  func findNext() {
    activeDocument?.findNext()
  }

  func findPrevious() {
    activeDocument?.findPrevious()
  }

  /// Closes the tab on screen, shell or file. The same path the strip's own
  /// close button takes, so unsaved work is asked about once and in one place.
  func closeActiveTab() {
    guard let workspace = selection?.workspace.id, let content = tabs.active(in: workspace) else {
      return
    }
    closeTab(content)
  }

  // MARK: Command palette

  /// Opens the file finder over the window.
  ///
  /// It is a sheet on this window because the folder it searches is this
  /// window's project. With no project open there is nothing to search, and
  /// saying so is better than an empty list somebody types into.
  func openCommandPalette() {
    guard let window else { return }
    guard let root = selection?.project.path else {
      let alert = NSAlert()
      alert.messageText = "There is no folder to search"
      alert.informativeText =
        "Open a project that points at a folder on disk, then try again."
      alert.beginSheetModal(for: window)
      return
    }
    let sheet = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 620, height: 420),
      styleMask: [.titled, .fullSizeContentView],
      backing: .buffered,
      defer: false)
    sheet.appearance = palette.appearance
    let view = CommandPaletteView(core: core, root: root, palette: palette, zoom: zoomLevel)
    view.onClose = { [weak self, weak sheet] in
      guard let sheet else { return }
      self?.window?.endSheet(sheet)
    }
    view.onOpen = { [weak self, weak sheet] path in
      guard let sheet else { return }
      self?.window?.endSheet(sheet)
      self?.openDocument(at: path)
    }
    sheet.contentView = view
    window.beginSheet(sheet)
    view.takeKeyboard()
  }

  /// A command click inside a rendered document. A markdown file next to it
  /// opens in its own tab, so following a chain of documents leaves the way back
  /// on screen; anything with a scheme is the browser's.
  private func follow(_ link: String, from documentPath: String) {
    switch DocumentLink.resolve(link, from: documentPath) {
    case .document(let path):
      guard FileManager.default.fileExists(atPath: path) else {
        let alert = NSAlert()
        alert.messageText = "That link points at a file that is not there"
        alert.informativeText = path
        alert.runModal()
        return
      }
      openDocument(at: path)
    case .external(let url):
      Browsers.open(url, in: nil)
    case nil:
      // An anchor inside the page, or a file this window has no view for.
      break
    }
  }

  // MARK: Zoom

  /// Steps the whole window up or down, or back to the default at zero.
  ///
  /// Zoom was the terminal's font size alone, which left the tab titles, the
  /// project list and the file names at their original size while the terminal
  /// grew — readable in one pane and not in the others. One value drives all of
  /// them now.
  func zoom(by steps: Double) {
    zoomLevel.step(by: steps)
    applyZoom()
  }

  private func applyZoom() {
    // The terminal reports its new cell grid on its own, which is what tells the
    // shell on the other side that its window changed shape.
    for view in views.values {
      view.fontSize = zoomLevel.terminalFontSize
    }
    for document in documents.values {
      document.zoom = zoomLevel
    }
    sidebar.zoom = zoomLevel
    browser.zoom = zoomLevel
    tabBar.zoom = zoomLevel
    placeholder.font = .systemFont(ofSize: zoomLevel.size(13))
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
      applyPalette()
    } catch {
      present(error, whileDoing: "That theme could not be applied")
    }
  }

  /// Hands the chosen colours to everything in the window, terminals included.
  ///
  /// One call rather than a branch in each view: a view that reads the palette
  /// cannot forget to follow a change, and following the system appearance is a
  /// palette of dynamic system colours rather than a special case.
  private func applyPalette() {
    palette = Palette.of(currentTheme)
    let theme = currentTheme
    for view in views.values {
      view.apply(theme: theme)
    }
    for document in documents.values {
      document.palette = palette
    }
    sidebar.palette = palette
    browser.palette = palette
    tabBar.palette = palette
    contentArea.wantsLayer = true
    contentArea.layer?.backgroundColor = palette.background.cgColor
    placeholder.textColor = palette.secondaryText
    window?.backgroundColor = palette.background
    // The title bar and any menu drawn over the window are AppKit's to paint,
    // and they follow the appearance rather than a colour anyone sets.
    window?.appearance = palette.appearance
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

  private func renameProject(_ project: CoreProject) {
    guard
      let name = askName(
        title: "Rename Project", placeholder: project.name, initial: project.name,
        confirm: "Rename")
    else { return }
    updateTree(.renameProject(project: project.id, name: name))
  }

  private func renameWorkspace(_ workspace: CoreWorkspace) {
    guard
      let name = askName(
        title: "Rename Workspace", placeholder: workspace.name, initial: workspace.name,
        confirm: "Rename")
    else { return }
    updateTree(.renameWorkspace(workspace: workspace.id, name: name))
  }

  /// Removes a project from the tree. The shells under it end here rather than
  /// in the core, because the core is told about sessions and knows nothing
  /// about which row they were opened from.
  private func deleteProject(_ project: CoreProject) {
    let workspaces = project.workspaces.count
    guard
      confirmDelete(
        what: "the project “\(project.name)”",
        detail: workspaces == 0
          ? "The folder on disk is not touched."
          : "Its \(workspaces) workspace(s) and their shells close. The folder on disk is not touched.")
    else { return }
    for workspace in project.workspaces {
      endTabs(of: workspace.id)
    }
    if selection?.project.id == project.id {
      selection = nil
      browser.show(project: nil)
    }
    updateTree(.deleteProject(project: project.id))
  }

  private func deleteWorkspace(_ workspace: CoreWorkspace) {
    guard
      confirmDelete(
        what: "the workspace “\(workspace.name)”",
        detail: "Its shells close. Nothing on disk is touched.")
    else { return }
    endTabs(of: workspace.id)
    if selection?.workspace.id == workspace.id {
      selection = nil
    }
    updateTree(.deleteWorkspace(workspace: workspace.id))
  }

  /// Ends every shell a workspace had open and forgets its tabs. Unsaved
  /// documents are asked about first, the same question closing the tab asks.
  private func endTabs(of workspace: UInt64) {
    for document in documents.filter({ $0.key.workspace == workspace }) {
      _ = document.value.confirmDiscardingChanges()
      documents.removeValue(forKey: document.key)
    }
    for session in tabs.removeWorkspace(workspace) {
      try? core.expectOk(.close(session: session))
      views.removeValue(forKey: session)
    }
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
      // A deleted row leaves nothing selected, so the strip and the area under
      // it are redrawn rather than left showing the tabs of a workspace that is
      // no longer in the tree.
      showActiveTab()
    } catch {
      present(error, whileDoing: "Project tree could not be updated")
    }
  }

  func windowDidBecomeKey(_ notification: Notification) {
    showActiveTab()
  }

  /// Everything but the middle folds away. The tabs are the app.
  func splitView(_ splitView: NSSplitView, canCollapseSubview subview: NSView) -> Bool {
    subview === sidebar || subview === browser
  }

  /// A yes or no before something goes. The destructive button is not the
  /// default one, so the return key cannot delete anything.
  private func confirmDelete(what: String, detail: String) -> Bool {
    let alert = NSAlert()
    alert.messageText = "Delete \(what)?"
    alert.informativeText = detail
    alert.alertStyle = .warning
    alert.addButton(withTitle: "Cancel")
    alert.addButton(withTitle: "Delete")
    return alert.runModal() == .alertSecondButtonReturn
  }

  private func askName(
    title: String, placeholder: String, initial: String = "", confirm: String = "Create"
  ) -> String? {
    let field = NSTextField(string: initial)
    field.placeholderString = placeholder
    field.frame = NSRect(x: 0, y: 0, width: 280, height: 24)
    let alert = NSAlert()
    alert.messageText = title
    alert.accessoryView = field
    alert.addButton(withTitle: confirm)
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

  /// Asks about every unsaved document. `false` means the app must stay open,
  /// which is why this is separate from `closeSessions`: by the time the shells
  /// are being ended it is too late to cancel.
  func confirmClosingDocuments() -> Bool {
    for document in documents.values where !document.confirmDiscardingChanges() {
      return false
    }
    return true
  }

  /// Ends every shell. The core also clears sessions when it is freed; doing it
  /// here means a closed window does not leave one running until quit.
  func closeSessions() {
    drain?.invalidate()
    drain = nil
    detect?.invalidate()
    detect = nil
    watchGit?.invalidate()
    watchGit = nil
    for session in tabs.allSessions {
      try? core.expectOk(.close(session: session))
    }
    tabs = TerminalTabs()
    views.removeAll()
    documents.removeAll()
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
