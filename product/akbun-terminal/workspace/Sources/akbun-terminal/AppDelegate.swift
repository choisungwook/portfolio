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

  private func buildMenu(for controller: TerminalWindowController) {
    let appMenu = NSMenu()
    appMenu.addItem(
      withTitle: "Check for Updates…", action: #selector(checkForUpdates), keyEquivalent: ""
    ).target = self
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Quit akbun-terminal", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

    let appItem = NSMenuItem()
    appItem.submenu = appMenu

    let editMenu = NSMenu(title: "Edit")
    editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    let editItem = NSMenuItem()
    editItem.submenu = editMenu

    let viewMenu = NSMenu(title: "View")
    viewMenu.addItem(withTitle: "Bigger", action: #selector(zoomIn), keyEquivalent: "+").target = self
    // The same command on the key people actually press. ⌘+ needs shift on a US
    // keyboard, and nobody holds shift to zoom in.
    let alsoBigger = viewMenu.addItem(
      withTitle: "Bigger", action: #selector(zoomIn), keyEquivalent: "=")
    alsoBigger.target = self
    alsoBigger.isHidden = true
    viewMenu.addItem(withTitle: "Smaller", action: #selector(zoomOut), keyEquivalent: "-").target = self
    viewMenu.addItem(
      withTitle: "Default Size", action: #selector(zoomReset), keyEquivalent: "0"
    ).target = self
    viewMenu.addItem(.separator())
    viewMenu.addItem(
      withTitle: "Hide File Browser", action: #selector(toggleFileBrowser), keyEquivalent: "b"
    ).target = self
    let themes = NSMenu(title: "Theme")
    for name in [CoreTheme.system] + controller.themes.map(\.name) {
      let item = themes.addItem(withTitle: name, action: #selector(chooseTheme), keyEquivalent: "")
      item.target = self
      item.state = name == controller.themeName ? .on : .off
    }
    let themeItem = viewMenu.addItem(withTitle: "Theme", action: nil, keyEquivalent: "")
    themeItem.submenu = themes
    let viewItem = NSMenuItem()
    viewItem.submenu = viewMenu

    let mainMenu = NSMenu()
    mainMenu.addItem(appItem)
    mainMenu.addItem(editItem)
    mainMenu.addItem(viewItem)
    NSApp.mainMenu = mainMenu
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
