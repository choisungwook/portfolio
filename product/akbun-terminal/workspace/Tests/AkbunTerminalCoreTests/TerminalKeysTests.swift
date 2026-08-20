import Testing
@testable import AkbunTerminalCore

struct TerminalKeysTests {
  @Test func shiftAndReturnSendEscapeReturn() {
    // The one sequence a CLI can tell apart from a plain return.
    #expect(TerminalKeys.bytes(keyCode: TerminalKeys.returnKeyCode, shift: true) == [0x1b, 0x0d])
    // The keypad's Enter is a different key and the same intent.
    #expect(
      TerminalKeys.bytes(keyCode: TerminalKeys.keypadEnterKeyCode, shift: true) == [0x1b, 0x0d])
  }

  @Test func everythingElseIsLeftToTheEmulator() {
    // Return on its own has to stay one byte, or nothing in a shell runs.
    #expect(TerminalKeys.bytes(keyCode: TerminalKeys.returnKeyCode, shift: false) == nil)
    // Shift with any other key is the emulator's, which is where the layout,
    // the dead keys and the escape sequences already live.
    #expect(TerminalKeys.bytes(keyCode: 0, shift: true) == nil)
    #expect(TerminalKeys.bytes(keyCode: 126, shift: true) == nil)
  }
}
