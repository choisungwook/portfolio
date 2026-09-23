import Foundation
import Testing

@testable import AkbunTerminalCore

struct SessionColorTests {
  private func theme(background: String, foreground: String, blue: String) throws -> CoreTheme {
    var palette = Array(repeating: "\"#808080\"", count: 16)
    palette[4] = "\"\(blue)\""
    let json = #"{"name":"T","background":""# + background + #"","foreground":""# + foreground
      + #"","cursor":""# + foreground + #"","palette":["# + palette.joined(separator: ",") + "]}"
    return try JSONDecoder().decode(CoreTheme.self, from: Data(json.utf8))
  }

  @Test func aDarkThemeGetsAReadableComplementOfItsBlue() throws {
    let nord = try theme(background: "#2e3440", foreground: "#d8dee9", blue: "#81a1c1")
    let session = try #require(nord.sessionForeground)
    let panel = try #require(nord.panelBackground)
    #expect(CoreTheme.contrast(session, panel) >= CoreTheme.sessionContrast)
    // Blue's complement is orange: red leads and blue trails.
    #expect(session.red > session.green && session.green > session.blue)
  }

  @Test func aLightThemeGoesDarkerRatherThanLighter() throws {
    let light = try theme(background: "#ffffff", foreground: "#24292f", blue: "#0969da")
    let session = try #require(light.sessionForeground)
    let panel = try #require(light.panelBackground)
    #expect(CoreTheme.contrast(session, panel) >= CoreTheme.sessionContrast)
    #expect(CoreTheme.relativeLuminance(session) < CoreTheme.relativeLuminance(panel))
  }

  @Test func hueSurvivesTheRoundTrip() {
    let (hue, saturation, lightness) = CoreTheme.hsl((0x26, 0x8b, 0xd2))
    let back = CoreTheme.rgb(hue: hue, saturation: saturation, lightness: lightness)
    #expect(back == (0x26, 0x8b, 0xd2))
  }

  @Test func anUnreadableBlueGivesNoColour() throws {
    let broken = try theme(background: "#000000", foreground: "#ffffff", blue: "blue")
    #expect(broken.sessionForeground == nil)
  }
}
