import Testing

@testable import AkbunTerminalCore

/// Zoom is one number the whole window reads, so its steps and its limits are
/// checked here rather than by watching text grow.
struct ZoomTests {
  @Test func stepsUpAndDownFromTheDefault() {
    var zoom = Zoom()
    #expect(zoom.terminalFontSize == Zoom.base)
    #expect(zoom.scale == 1)

    zoom.step(by: 1)
    #expect(zoom.terminalFontSize == Zoom.base + 1)
    zoom.step(by: -2)
    #expect(zoom.terminalFontSize == Zoom.base - 1)
  }

  @Test func zeroIsTheResetRatherThanAStepOfNothing() {
    var zoom = Zoom()
    zoom.step(by: 6)
    zoom.step(by: 0)
    #expect(zoom.terminalFontSize == Zoom.base)
  }

  @Test func stopsAtBothEnds() {
    var zoom = Zoom()
    for _ in 0..<100 { zoom.step(by: 1) }
    #expect(zoom.terminalFontSize == Zoom.largest)
    for _ in 0..<100 { zoom.step(by: -1) }
    #expect(zoom.terminalFontSize == Zoom.smallest)
  }

  @Test func everyOtherSizeFollowsTheTerminal() {
    var zoom = Zoom()
    // Unzoomed, a control asking for its own default gets exactly that back.
    #expect(zoom.size(12) == 12)

    zoom.step(by: Zoom.base)
    #expect(zoom.scale == 2)
    #expect(zoom.size(12) == 24)
    // Rounded, because a font at a fractional size draws blurred.
    #expect(zoom.size(12.4) == 25)
  }
}
