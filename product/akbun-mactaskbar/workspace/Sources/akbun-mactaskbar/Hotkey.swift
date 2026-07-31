import AppKit
import Carbon.HIToolbox

extension Notification.Name {
  static let mactaskbarHotkey = Notification.Name("io.akbun.mactaskbar.hotkey")
}

/// A system-wide shortcut for cycling sections.
///
/// This is not only a convenience. macOS hands a new status item the leftmost
/// slot, and on a full bar that slot is under the camera housing, so the control
/// icon can be undrawable on exactly the machines this app is for. The shortcut
/// is the way in when that happens without going back to Finder.
///
/// Carbon's `RegisterEventHotKey` is used rather than an `NSEvent` monitor
/// because it needs no accessibility permission and it consumes the key, so the
/// shortcut does not also reach the focused app.
///
/// Consuming the key is also the cost. A combination claimed system-wide is one
/// taken from whatever else wanted it, and macOS gives no way to ask what that
/// might be: a second registration of a combination another app already owns can
/// succeed and simply never fire. So the combination is a setting with a short
/// list of choices and an off switch, rather than a constant.
@MainActor
enum Hotkey {
  struct Choice: Identifiable, Hashable, Sendable {
    let id: String
    let label: String
    let keyCode: UInt32
    let modifiers: UInt32
  }

  static let off = Choice(id: "off", label: "off", keyCode: 0, modifiers: 0)

  static let choices: [Choice] = [
    off,
    Choice(id: "ctrl-cmd-b", label: "⌃⌘B", keyCode: UInt32(kVK_ANSI_B), modifiers: UInt32(controlKey | cmdKey)),
    Choice(id: "ctrl-opt-cmd-b", label: "⌃⌥⌘B", keyCode: UInt32(kVK_ANSI_B), modifiers: UInt32(controlKey | optionKey | cmdKey)),
    Choice(id: "ctrl-cmd-m", label: "⌃⌘M", keyCode: UInt32(kVK_ANSI_M), modifiers: UInt32(controlKey | cmdKey)),
  ]

  static func choice(id: String) -> Choice {
    choices.first { $0.id == id } ?? off
  }

  private static var hotKeyRef: EventHotKeyRef?
  private static var handlerRef: EventHandlerRef?

  /// Replaces whatever is registered with the given choice. Registering `off`
  /// leaves the combination to the rest of the system.
  static func apply(_ choice: Choice) {
    if let existing = hotKeyRef {
      UnregisterEventHotKey(existing)
      hotKeyRef = nil
    }
    guard choice != off else { return }

    if handlerRef == nil {
      var eventType = EventTypeSpec(
        eventClass: OSType(kEventClassKeyboard),
        eventKind: OSType(kEventHotKeyPressed)
      )
      InstallEventHandler(GetApplicationEventTarget(), hotkeyHandler, 1, &eventType, nil, &handlerRef)
    }

    // Four bytes identifying this registration, in the Carbon tradition.
    let id = EventHotKeyID(signature: OSType(0x414B_4254), id: 1)
    RegisterEventHotKey(
      choice.keyCode,
      choice.modifiers,
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
