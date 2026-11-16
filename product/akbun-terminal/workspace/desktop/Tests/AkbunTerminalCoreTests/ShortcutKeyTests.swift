import Foundation
import Testing

@testable import AkbunTerminalCore

/// A shortcut arrives from the core as `cmd+shift+f` and has to become two
/// things AppKit understands. The conversion is the only part of a rebindable
/// menu that can be wrong, which is why it is asked here rather than through a
/// menu nobody can open in a test.
struct ShortcutKeyTests {
  @Test func aModifiedLetterBecomesAKeyEquivalentAndAMask() {
    let key = ShortcutKey.parse("cmd+shift+f")
    #expect(key?.equivalent == "f")
    #expect(key?.modifiers == [.command, .shift])
  }

  @Test func theKeysWithNoPrintableCharacterHaveNames() {
    #expect(ShortcutKey.parse("cmd+plus")?.equivalent == "+")
    #expect(ShortcutKey.parse("cmd+minus")?.equivalent == "-")
    #expect(ShortcutKey.parse("cmd+left")?.equivalent == "\u{f702}")
    #expect(ShortcutKey.parse("ctrl+space")?.equivalent == " ")
    // F1 through F20 are one unicode value each, counting up from F1.
    #expect(ShortcutKey.parse("f5")?.equivalent == "\u{f708}")
  }

  @Test func thePlusKeyItselfSurvivesTheSeparator() {
    // "cmd++" is command with plus, and splitting on + leaves the key empty.
    #expect(ShortcutKey.parse("cmd++")?.equivalent == "+")
  }

  @Test func aShortcutThisBuildCannotDrawIsNothingRatherThanTheWrongKey() {
    #expect(ShortcutKey.parse("cmd+nonsense") == nil)
    #expect(ShortcutKey.parse("cmd") == nil)
    #expect(ShortcutKey.parse("") == nil)
    #expect(ShortcutKey.parse("   ") == nil)
  }

  @Test func thePersonReadingItSeesTheSymbolsInTheOrderMacOSUses() {
    // The core stores the modifiers command first; macOS draws them last.
    #expect(ShortcutKey.display("cmd+shift+g") == "⇧⌘G")
    #expect(ShortcutKey.display("ctrl+alt+left") == "⌃⌥←")
    #expect(ShortcutKey.display("cmd+plus") == "⌘+")
  }

  @Test func aRecordedKeyPressIsWrittenTheWayTheCoreStoresIt() {
    #expect(
      ShortcutKey.describe(character: "S", modifiers: [.command, .shift]) == "cmd+shift+s")
    #expect(ShortcutKey.describe(character: "=", modifiers: [.command]) == "cmd+plus")
    // Nothing held down belongs to the shell in the middle of the window, so it
    // is not a shortcut this window will offer to save.
    #expect(ShortcutKey.describe(character: "k", modifiers: []) == nil)
    #expect(ShortcutKey.describe(character: "k", modifiers: [.shift]) == nil)
  }
}
