import AppKit
import MacTaskbarCore
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
  private var sections: SectionController!
  private var model: ItemsModel!
  private var window: NSWindow?
  private var isUpdating = false

  func applicationDidFinishLaunching(_ notification: Notification) {
    sections = SectionController()
    sections.onContextMenu = { [weak self] in self?.contextMenu() ?? NSMenu() }
    model = ItemsModel(sections: sections)

    Hotkey.apply(Defaults.hotkey)
    NotificationCenter.default.addObserver(
      forName: .mactaskbarHotkey, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.sections.cycle() }
    }

    // Divider width is derived from the screen, so a display change has to
    // re-apply the current state or a wide divider stops reaching the edge.
    NotificationCenter.default.addObserver(
      forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.sections.refreshForScreenChange() }
    }

    Updater.cleanupTempDirs()
    openWindowIfControlIsUnreachable()
  }

  /// An app with no dock icon and no window looks like nothing happened, and
  /// here it can genuinely be nothing: on a full bar the control icon lands
  /// under the camera housing where macOS draws no status items. AppKit needs a
  /// moment to place the item, so the check waits before deciding.
  private func openWindowIfControlIsUnreachable() {
    Task {
      try? await Task.sleep(for: .seconds(1))
      if sections.controlIsHidden { openItemsWindow() }
    }
  }

  // MARK: - Window

  func openItemsWindow() {
    if let window {
      window.makeKeyAndOrderFront(nil)
      NSApp.activate(ignoringOtherApps: true)
      return
    }

    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 460, height: 560),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = "Menu Bar Items"
    window.contentView = NSHostingView(rootView: ItemsView(model: model))
    window.center()
    window.isReleasedWhenClosed = false
    self.window = window

    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    Task { await model.rescan() }
  }

  /// Launching the app again from Finder or Launchpad brings the window back.
  /// This is the only way in when the control icon cannot be drawn, so it is
  /// not a convenience.
  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
    openItemsWindow()
    return true
  }

  // MARK: - Menu

  private func contextMenu() -> NSMenu {
    let menu = NSMenu()
    menu.addItem(
      withTitle: "Menu Bar Items…", action: #selector(showItems), keyEquivalent: ""
    ).target = self
    menu.addItem(
      withTitle: "Check for Updates…", action: #selector(checkForUpdates), keyEquivalent: ""
    ).target = self
    menu.addItem(.separator())
    menu.addItem(withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    return menu
  }

  @objc private func showItems() { openItemsWindow() }

  // MARK: - Update

  @objc private func checkForUpdates() {
    guard !isUpdating else { return }
    Task { await runUpdateCheck() }
  }

  private var currentVersion: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
  }

  private func runUpdateCheck() async {
    do {
      let result = try await Updater.check(currentVersion: currentVersion)
      guard result.hasUpdate, let latest = result.latest else {
        show(title: "Already on the latest version", detail: "Current version \(result.current)")
        return
      }

      // Replacing the bundle only makes sense for an installed build; a debug
      // binary run from the build directory has no bundle to swap.
      let canInstall = Bundle.main.bundleURL.pathExtension == "app" && result.dmgURL != nil
      let buttons = canInstall ? ["Update now", "Open release", "Close"] : ["Open release", "Close"]
      let detail =
        canInstall
        ? "Current version \(result.current). Update now downloads the dmg, replaces the app and relaunches it."
        : "Current version \(result.current). Download the dmg from the release page."

      let answer = show(title: "Version \(latest) is available", detail: detail, buttons: buttons)
      if canInstall, answer == .alertFirstButtonReturn, let dmgURL = result.dmgURL {
        await install(dmgURL)
        return
      }
      let openIndex: NSApplication.ModalResponse =
        canInstall ? .alertSecondButtonReturn : .alertFirstButtonReturn
      if answer == openIndex, let url = result.releaseURL { NSWorkspace.shared.open(url) }
    } catch {
      show(title: "Cannot check for updates", detail: error.localizedDescription, style: .warning)
    }
  }

  /// Downloads the dmg, starts the swap script and quits; the script relaunches
  /// the app. A failure before the script starts removes the dmg here, after it
  /// starts the script's own trap owns cleanup.
  private func install(_ dmgURL: URL) async {
    isUpdating = true
    var dmg: URL?
    do {
      let downloaded = try await Updater.downloadDmg(from: dmgURL)
      dmg = downloaded
      try Updater.spawnSwap(appBundle: Updater.appBundleURL(), dmg: downloaded)
      NSApp.terminate(nil)
    } catch {
      if let dmg { try? FileManager.default.removeItem(at: dmg.deletingLastPathComponent()) }
      isUpdating = false
      show(title: "Update install failed", detail: error.localizedDescription, style: .warning)
    }
  }

  @discardableResult
  private func show(
    title: String,
    detail: String,
    style: NSAlert.Style = .informational,
    buttons: [String] = ["OK"]
  ) -> NSApplication.ModalResponse {
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = detail
    alert.alertStyle = style
    for button in buttons { alert.addButton(withTitle: button) }
    NSApp.activate(ignoringOtherApps: true)
    return alert.runModal()
  }
}
