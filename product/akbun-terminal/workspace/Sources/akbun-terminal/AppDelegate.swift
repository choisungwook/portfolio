import AppKit
import AkbunTerminalCore
import UserNotifications

/// Wires the core to one window and puts the update check in the menu.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, @preconcurrency
  UNUserNotificationCenterDelegate
{
  /// The workspace a delivered notification will take the user to.
  private static let workspaceKey = "workspace"
  private var core: CoreBridge?
  private var windowController: TerminalWindowController?
  /// Kept so the settings window is the same one every time it is opened.
  private var shortcutsWindow: ShortcutsWindowController?

  func applicationDidFinishLaunching(_ notification: Notification) {
    // Clear whatever an update killed halfway through, before anything else can
    // add to the temp directory.
    Updater.cleanupTempDirs()

    do {
      let core = try CoreBridge()
      try core.handshake()
      let controller = TerminalWindowController(core: core)
      try controller.start()
      controller.showWindow(nil)
      self.core = core
      self.windowController = controller
      // Built after the controller, because the theme list comes from the core
      // and there is nothing to choose between before it has answered.
      buildMenu(for: controller)
      prepareNotifications(for: controller)
    } catch {
      // A core that cannot start leaves nothing to show, so say why and stop
      // rather than opening an empty window.
      let alert = NSAlert()
      alert.messageText = "akbun-terminal could not start"
      alert.informativeText = error.localizedDescription
      alert.runModal()
      NSApp.terminate(nil)
    }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }

  /// Quitting is the other way a document tab closes, and the only one that
  /// used to take unsaved work with it. The question belongs here rather than in
  /// `applicationWillTerminate`, which cannot say no.
  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    (windowController?.confirmClosingDocuments() ?? true) ? .terminateNow : .terminateCancel
  }

  func applicationWillTerminate(_ notification: Notification) {
    windowController?.closeSessions()
  }

  /// Builds the menu bar from the core's command list.
  ///
  /// Every key on it comes from the core, so a rebound shortcut is one call and
  /// a redraw rather than a search through this file. The action for a command
  /// is looked up by id: adding a command is a row in the core's table and a
  /// selector here, and nothing in between.
  private func buildMenu(for controller: TerminalWindowController) {
    let shortcuts = (try? core?.shortcuts()) ?? []

    let appMenu = NSMenu()
    appMenu.addItem(
      withTitle: "Check for Updates…", action: #selector(checkForUpdates), keyEquivalent: ""
    ).target = self
    appMenu.addItem(.separator())
    appMenu.addItem(
      withTitle: "Quit akbun-terminal", action: #selector(NSApplication.terminate(_:)),
      keyEquivalent: "q")
    let appItem = NSMenuItem()
    appItem.submenu = appMenu

    let fileMenu = NSMenu(title: "File")
    add(commands(in: "File", from: shortcuts), to: fileMenu)
    let fileItem = NSMenuItem(title: "File", action: nil, keyEquivalent: "")
    fileItem.submenu = fileMenu

    let editMenu = NSMenu(title: "Edit")
    editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    editMenu.addItem(.separator())
    add(commands(in: "Edit", from: shortcuts), to: editMenu)
    let editItem = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
    editItem.submenu = editMenu

    let viewMenu = NSMenu(title: "View")
    add(commands(in: "View", from: shortcuts), to: viewMenu)
    let viewItem = NSMenuItem(title: "View", action: nil, keyEquivalent: "")
    viewItem.submenu = viewMenu

    // Settings is its own menu rather than an item under the application menu,
    // because the theme list used to be buried in View where nobody looking for
    // it would think to open it.
    let settingsMenu = NSMenu(title: "Settings")
    let themeItem = settingsMenu.addItem(withTitle: "Theme", action: nil, keyEquivalent: "")
    themeItem.submenu = themeMenu(for: controller)
    settingsMenu.addItem(
      withTitle: "Shortcuts…", action: #selector(openShortcuts), keyEquivalent: ""
    ).target = self
    let settingsItem = NSMenuItem(title: "Settings", action: nil, keyEquivalent: "")
    settingsItem.submenu = settingsMenu

    let mainMenu = NSMenu()
    for item in [appItem, fileItem, editItem, viewItem, settingsItem] {
      mainMenu.addItem(item)
    }
    NSApp.mainMenu = mainMenu
  }

  private func commands(in menu: String, from shortcuts: [CoreShortcut]) -> [CoreShortcut] {
    shortcuts.filter { $0.menu == menu }
  }

  /// One item per command, with the key the core says it is on. A command this
  /// build has no action for is skipped rather than drawn as a dead row.
  private func add(_ shortcuts: [CoreShortcut], to menu: NSMenu) {
    for shortcut in shortcuts {
      guard let action = Self.actions[shortcut.command] else { continue }
      let item = menu.addItem(withTitle: shortcut.title, action: action, keyEquivalent: "")
      item.target = self
      guard let key = ShortcutKey.parse(shortcut.key) else { continue }
      item.keyEquivalent = key.equivalent
      item.keyEquivalentModifierMask = Self.flags(key.modifiers)
      // ⌘+ needs shift on a US keyboard and nobody holds shift to zoom in, so
      // the same command is also on the key people actually press.
      if key.equivalent == "+" {
        let twin = menu.addItem(withTitle: shortcut.title, action: action, keyEquivalent: "=")
        twin.target = self
        twin.keyEquivalentModifierMask = Self.flags(key.modifiers)
        twin.isHidden = true
      }
    }
  }

  /// The one place a command id becomes something that runs. The core owns the
  /// list and the keys; this owns what each one does.
  private static let actions: [String: Selector] = [
    "new_tab": #selector(AppDelegate.newTab),
    "open_file": #selector(AppDelegate.openPalette),
    "close_tab": #selector(AppDelegate.closeTab),
    "save": #selector(AppDelegate.saveDocument),
    "edit_mode": #selector(AppDelegate.toggleEditMode),
    "find": #selector(AppDelegate.beginFind),
    "find_next": #selector(AppDelegate.findNext),
    "find_previous": #selector(AppDelegate.findPrevious),
    "zoom_in": #selector(AppDelegate.zoomIn),
    "zoom_out": #selector(AppDelegate.zoomOut),
    "zoom_reset": #selector(AppDelegate.zoomReset),
    "toggle_file_browser": #selector(AppDelegate.toggleFileBrowser),
  ]

  private static func flags(_ modifiers: ShortcutKey.Modifiers) -> NSEvent.ModifierFlags {
    var flags = NSEvent.ModifierFlags()
    if modifiers.contains(.command) { flags.insert(.command) }
    if modifiers.contains(.control) { flags.insert(.control) }
    if modifiers.contains(.option) { flags.insert(.option) }
    if modifiers.contains(.shift) { flags.insert(.shift) }
    return flags
  }

  private func themeMenu(for controller: TerminalWindowController) -> NSMenu {
    let themes = NSMenu(title: "Theme")
    for name in [CoreTheme.system] + controller.themes.map(\.name) {
      let item = themes.addItem(withTitle: name, action: #selector(chooseTheme), keyEquivalent: "")
      item.target = self
      item.state = name == controller.themeName ? .on : .off
    }
    return themes
  }

  @objc private func openShortcuts() {
    guard let core else { return }
    let controller = shortcutsWindow ?? ShortcutsWindowController(core: core)
    shortcutsWindow = controller
    controller.onChange = { [weak self] in
      guard let self, let window = self.windowController else { return }
      // The menu is built from the core, so a changed key is one rebuild.
      self.buildMenu(for: window)
    }
    controller.showWindow(nil)
    controller.window?.center()
    controller.window?.makeKeyAndOrderFront(nil)
  }

  @objc private func newTab() {
    windowController?.openTab()
  }

  @objc private func openPalette() {
    windowController?.openCommandPalette()
  }

  @objc private func closeTab() {
    windowController?.closeActiveTab()
  }

  @objc private func saveDocument() {
    windowController?.saveActiveDocument()
  }

  @objc private func beginFind() {
    windowController?.beginFind()
  }

  @objc private func findNext() {
    windowController?.findNext()
  }

  @objc private func findPrevious() {
    windowController?.findPrevious()
  }

  @objc private func toggleEditMode() {
    windowController?.toggleEditMode()
  }

  @objc private func zoomIn() {
    windowController?.zoom(by: 1)
  }

  @objc private func zoomOut() {
    windowController?.zoom(by: -1)
  }

  @objc private func zoomReset() {
    windowController?.zoom(by: 0)
  }

  // MARK: Notifications

  /// Asks once for permission and routes a finished workspace to a banner.
  ///
  /// A refusal is not an error worth reporting: the colour in the sidebar is the
  /// primary signal and it does not need permission from anyone. The banner is
  /// the part that reaches somebody looking at another window.
  private func prepareNotifications(for controller: TerminalWindowController) {
    guard Bundle.main.bundleIdentifier != nil else { return }
    let centre = UNUserNotificationCenter.current()
    centre.delegate = self
    centre.requestAuthorization(options: [.alert, .sound]) { _, _ in }
    controller.onWorkspaceFinished = { project, workspace in
      let content = UNMutableNotificationContent()
      content.title = workspace.name
      content.body = "\(project.name) finished."
      content.userInfo = [Self.workspaceKey: String(workspace.id)]
      centre.add(
        UNNotificationRequest(
          identifier: "workspace-\(workspace.id)", content: content, trigger: nil))
    }
  }

  /// The window is not necessarily in front when work finishes, and the banner
  /// is the whole point, so it is shown even while the app is active.
  func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let info = response.notification.request.content.userInfo
    if let raw = info[Self.workspaceKey] as? String, let workspace = UInt64(raw) {
      NSApp.activate(ignoringOtherApps: true)
      windowController?.reveal(workspace: workspace)
    }
    completionHandler()
  }

  @objc private func toggleFileBrowser(_ sender: NSMenuItem) {
    guard let hidden = windowController?.toggleFileBrowser() else { return }
    sender.title = hidden ? "Show File Browser" : "Hide File Browser"
  }

  @objc private func chooseTheme(_ sender: NSMenuItem) {
    windowController?.applyTheme(named: sender.title)
    // The tick follows the controller, not the click, so a name the core
    // refused does not end up looking like it was applied.
    for item in sender.menu?.items ?? [] {
      item.state = item.title == windowController?.themeName ? .on : .off
    }
  }

  @objc private func checkForUpdates() {
    Task { await runUpdateCheck() }
  }

  private func runUpdateCheck() async {
    let current = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    do {
      let result = try await Updater.check(currentVersion: current)
      guard result.hasUpdate, let latest = result.latest else {
        presentInfo("akbun-terminal \(current) is the newest build.")
        return
      }
      guard let dmg = result.dmgURL, Updater.canInstallInPlace else {
        // A development build would replace the wrong bundle, so it only gets a
        // link to the release page.
        presentReleasePage(version: latest, url: result.releaseURL)
        return
      }
      guard confirmInstall(version: latest) else { return }
      let downloaded = try await Updater.downloadDmg(from: dmg)
      try Updater.spawnSwap(appBundle: Bundle.main.bundleURL, dmg: downloaded)
      windowController?.closeSessions()
      NSApp.terminate(nil)
    } catch {
      presentInfo("Update check failed: \(error.localizedDescription)")
    }
  }

  private func presentInfo(_ text: String) {
    let alert = NSAlert()
    alert.messageText = text
    alert.runModal()
  }

  private func presentReleasePage(version: String, url: URL?) {
    let alert = NSAlert()
    alert.messageText = "Version \(version) is available"
    alert.informativeText = "This build cannot replace itself. Open the release page to download it."
    alert.addButton(withTitle: "Open Release Page")
    alert.addButton(withTitle: "Later")
    if alert.runModal() == .alertFirstButtonReturn, let url {
      NSWorkspace.shared.open(url)
    }
  }

  private func confirmInstall(version: String) -> Bool {
    let alert = NSAlert()
    alert.messageText = "Install version \(version)?"
    alert.informativeText = "akbun-terminal will quit, replace itself and start again. Running shells end."
    alert.addButton(withTitle: "Install and Restart")
    alert.addButton(withTitle: "Later")
    return alert.runModal() == .alertFirstButtonReturn
  }
}
