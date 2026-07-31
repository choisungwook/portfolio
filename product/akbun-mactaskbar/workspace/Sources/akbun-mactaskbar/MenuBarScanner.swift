import AppKit
import ApplicationServices
import MacTaskbarCore

/// Reads the whole bar through the accessibility API.
///
/// macOS has no API that lists status items across applications. The
/// accessibility API does expose them, one owning process at a time, so every
/// running process has to be asked. Each process exposes its status items under
/// a dedicated attribute, so there is no menu to walk and nothing to filter by
/// position: whatever is there is a status item.
///
/// The risk is an unresponsive app. An accessibility call into one blocks until
/// it answers, and asking ninety processes in a row would hang the scan on the
/// first bad one. `AXUIElementSetMessagingTimeout` bounds each call, and the
/// processes are asked in parallel, so a hung app costs its own slot and
/// nothing else.
enum MenuBarScanner {
  /// The attribute holding an application's status items. Foundation does not
  /// re-export the constant, so the raw name is used.
  private static let extrasMenuBarAttribute = "AXExtrasMenuBar"

  /// Long enough for a busy app to answer, short enough that a wedged one does
  /// not stretch the scan.
  private static let messagingTimeout: Float = 1.0

  struct Process: Sendable {
    let pid: pid_t
    let name: String
  }

  @MainActor
  static var isTrusted: Bool { AXIsProcessTrusted() }

  /// Shows the system prompt that sends the user to Privacy & Security.
  @MainActor
  static func requestTrust() {
    // The constant is a global var, which Swift 6 will not let a concurrent
    // context touch. Its value is this string.
    let options = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
    _ = AXIsProcessTrustedWithOptions(options)
  }

  @MainActor
  static func runningProcesses() -> [Process] {
    NSWorkspace.shared.runningApplications.compactMap { app in
      guard let name = app.localizedName else { return nil }
      return Process(pid: app.processIdentifier, name: name)
    }
  }

  /// Every status item on the bar, left to right. Runs off the main thread: the
  /// accessibility calls block, and blocking the main thread would freeze the
  /// menu bar this app is supposed to be managing.
  static func scan(processes: [Process], geometry: BarGeometry) async -> [MenuBarItem] {
    await Task.detached(priority: .userInitiated) {
      collect(processes: processes, geometry: geometry)
    }.value
  }

  private static func collect(processes: [Process], geometry: BarGeometry) -> [MenuBarItem] {
    let collected = Collected()
    // Sized to the machine by libdispatch. Each iteration is one process, so a
    // slow one holds a single thread for at most the messaging timeout.
    DispatchQueue.concurrentPerform(iterations: processes.count) { index in
      let items = statusItems(of: processes[index], geometry: geometry)
      if !items.isEmpty { collected.add(items) }
    }
    return collected.all.sorted { $0.x < $1.x }
  }

  private static func statusItems(of process: Process, geometry: BarGeometry) -> [MenuBarItem] {
    let app = AXUIElementCreateApplication(process.pid)
    AXUIElementSetMessagingTimeout(app, messagingTimeout)

    guard let extras = copyElement(app, extrasMenuBarAttribute as CFString),
      let children = copyElements(extras, kAXChildrenAttribute as CFString)
    else { return [] }

    return children.compactMap { child in
      guard let position = copyPoint(child, kAXPositionAttribute as CFString),
        let size = copySize(child, kAXSizeAttribute as CFString),
        !isPlaceholder(width: size.width)
      else { return nil }
      return MenuBarItem(
        app: process.name,
        label: displayLabel(rawLabel: label(of: child), app: process.name),
        x: position.x,
        visible: geometry.isVisible(x: position.x)
      )
    }
  }

  private static func label(of element: AXUIElement) -> String? {
    copyString(element, kAXDescriptionAttribute as CFString)
      ?? copyString(element, kAXTitleAttribute as CFString)
  }

  // MARK: - Attribute reads

  private static func copyValue(_ element: AXUIElement, _ attribute: CFString) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute, &value) == .success else { return nil }
    return value
  }

  private static func copyElement(_ element: AXUIElement, _ attribute: CFString) -> AXUIElement? {
    guard let value = copyValue(element, attribute),
      CFGetTypeID(value) == AXUIElementGetTypeID()
    else { return nil }
    return (value as! AXUIElement)
  }

  private static func copyElements(_ element: AXUIElement, _ attribute: CFString) -> [AXUIElement]? {
    copyValue(element, attribute) as? [AXUIElement]
  }

  private static func copyString(_ element: AXUIElement, _ attribute: CFString) -> String? {
    copyValue(element, attribute) as? String
  }

  private static func copyPoint(_ element: AXUIElement, _ attribute: CFString) -> CGPoint? {
    guard let value = axValue(element, attribute) else { return nil }
    var point = CGPoint.zero
    guard AXValueGetValue(value, .cgPoint, &point) else { return nil }
    return point
  }

  private static func copySize(_ element: AXUIElement, _ attribute: CFString) -> CGSize? {
    guard let value = axValue(element, attribute) else { return nil }
    var size = CGSize.zero
    guard AXValueGetValue(value, .cgSize, &size) else { return nil }
    return size
  }

  private static func axValue(_ element: AXUIElement, _ attribute: CFString) -> AXValue? {
    guard let value = copyValue(element, attribute),
      CFGetTypeID(value) == AXValueGetTypeID()
    else { return nil }
    return (value as! AXValue)
  }

  /// Somewhere for the parallel iterations to put their results. A lock rather
  /// than an actor because `concurrentPerform` runs on plain dispatch threads.
  private final class Collected: @unchecked Sendable {
    private let lock = NSLock()
    private var items: [MenuBarItem] = []

    func add(_ new: [MenuBarItem]) {
      lock.lock()
      defer { lock.unlock() }
      items.append(contentsOf: new)
    }

    var all: [MenuBarItem] {
      lock.lock()
      defer { lock.unlock() }
      return items
    }
  }
}
