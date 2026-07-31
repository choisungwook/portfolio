import AppKit
import Carbon.HIToolbox

extension Notification.Name {
  static let mactaskbarHotkey = Notification.Name("io.akbun.mactaskbar.hotkey")
}

/// A system-wide shortcut for cycling sections.
///
/// This is not a convenience. macOS hands a new status item the leftmost slot,
/// and on a full bar that slot is under the camera housing, so the control icon
/// can be undrawable on exactly the machines this app is for. The shortcut is
/// the way in when that happens.
///
/// Carbon's `RegisterEventHotKey` is used rather than an `NSEvent` monitor
/// because it needs no accessibility permission and it consumes the key, so the
/// shortcut does not also reach the focused app.
@MainActor
enum Hotkey {
  /// Control-Command-B. Chosen to stay clear of the system defaults.
  static let displayName = "⌃⌘B"

  private static var hotKeyRef: EventHotKeyRef?
  private static var handlerRef: EventHandlerRef?

  static func register() {
    var eventType = EventTypeSpec(
      eventClass: OSType(kEventClassKeyboard),
      eventKind: OSType(kEventHotKeyPressed)
    )
    InstallEventHandler(GetApplicationEventTarget(), hotkeyHandler, 1, &eventType, nil, &handlerRef)

    // Four bytes identifying this registration, in the Carbon tradition.
    let id = EventHotKeyID(signature: OSType(0x414B_4254), id: 1)
    RegisterEventHotKey(
      UInt32(kVK_ANSI_B),
      UInt32(controlKey | cmdKey),
      id,
      GetApplicationEventTarget(),
      0,
      &hotKeyRef
    )
  }
}

/// Carbon calls back through a plain C function pointer, which cannot capture.
/// Posting a notification keeps the bridge to the rest of the app free of
/// global mutable state. Carbon delivers on the main thread, so the observer
/// runs there too.
private func hotkeyHandler(
  _ next: EventHandlerCallRef?,
  _ event: EventRef?,
  _ context: UnsafeMutableRawPointer?
) -> OSStatus {
  NotificationCenter.default.post(name: .mactaskbarHotkey, object: nil)
  return noErr
}
