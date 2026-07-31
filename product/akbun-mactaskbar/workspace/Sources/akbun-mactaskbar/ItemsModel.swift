import AppKit
import MacTaskbarCore
import Observation

/// State behind the item list window.
@MainActor
@Observable
final class ItemsModel {
  private let sections: SectionController

  var items: [MenuBarItem] = []
  var isScanning = false
  var query = ""
  var section: Section
  var isTrusted: Bool
  /// True when the control icon is running but drawn nowhere, which the window
  /// has to say out loud or the app just looks broken.
  var controlIsHidden = false

  var autoCollapseSeconds: Double {
    didSet { Defaults.autoCollapseSeconds = autoCollapseSeconds }
  }

  /// Changing this re-registers immediately, so a combination that turns out to
  /// clash with another app can be swapped without restarting.
  var hotkey: Hotkey.Choice {
    didSet {
      Defaults.hotkey = hotkey
      Hotkey.apply(hotkey)
      hotkeyFailed = Hotkey.registrationFailed
    }
  }

  /// Set when the shortcut could not be registered at all. A combination taken
  /// by another app does not land here, since macOS reports that as success.
  var hotkeyFailed = Hotkey.registrationFailed

  init(sections: SectionController) {
    self.sections = sections
    self.section = sections.state
    self.isTrusted = MenuBarScanner.isTrusted
    self.autoCollapseSeconds = Defaults.autoCollapseSeconds
    self.hotkey = Defaults.hotkey
    sections.onStateChange = { [weak self] state in
      self?.section = state
    }
  }

  var filtered: [MenuBarItem] {
    let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
    guard !needle.isEmpty else { return items }
    return items.filter {
      $0.app.lowercased().contains(needle) || $0.label.lowercased().contains(needle)
    }
  }

  var hiddenCount: Int { items.count { !$0.visible } }

  func cycle() {
    sections.cycle()
    // The bar needs a moment to settle before the new positions can be read.
    Task {
      try? await Task.sleep(for: .milliseconds(400))
      await rescan()
    }
  }

  func rescan() async {
    isTrusted = MenuBarScanner.isTrusted
    guard isTrusted else {
      items = []
      return
    }
    isScanning = true
    defer { isScanning = false }

    let geometry = currentBarGeometry()
    items = await MenuBarScanner.scan(processes: MenuBarScanner.runningProcesses(), geometry: geometry)
    controlIsHidden = sections.controlIsHidden
  }

  func requestTrust() {
    MenuBarScanner.requestTrust()
  }
}
