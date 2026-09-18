import Foundation
import Testing

@testable import AkbunTerminalCore

struct PanelSizeTests {
  @Test func persistsPanelSizeIndependentlyOfContentZoom() throws {
    let suite = "PanelSizeTests.\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    var panels = PanelSize(defaults: defaults)
    #expect(panels.percent == 100)
    panels.set(percent: 150)
    var content = Zoom()
    content.step(by: 5)
    content.step(by: 0)
    #expect(PanelSize(defaults: defaults).percent == 150)
    #expect(panels.zoom.size(12) == 18)
    #expect(content.terminalFontSize == 13)
    panels.set(percent: 100)
    #expect(PanelSize(defaults: defaults).zoom == Zoom())
  }

  @Test func boundsAndInvalidSavedValues() throws {
    let suite = "PanelSizeTests.\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    var panels = PanelSize(defaults: defaults)
    panels.set(percent: 0)
    #expect(panels.percent == 75)
    panels.set(percent: 500)
    #expect(PanelSize(defaults: defaults).percent == 200)
    panels.set(percent: .nan)
    #expect(panels.percent == 100)
    defaults.set(-100, forKey: "panelSizePercent")
    #expect(PanelSize(defaults: defaults).percent == 75)
  }
}
