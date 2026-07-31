import Foundation
import Testing

@testable import MacTaskbarCore

@Suite("Release arithmetic")
struct ReleaseTests {
  @Test("versions compare by component, not by string")
  func comparesNumerically() {
    #expect(compareVersion("0.10.0", "0.9.0") > 0)
    #expect(compareVersion("1.0.0", "1.0.0") == 0)
    #expect(compareVersion("0.1.0", "0.2.0") < 0)
  }

  @Test("a missing component counts as zero")
  func shortVersions() {
    #expect(compareVersion("1", "1.0.0") == 0)
    #expect(compareVersion("1.0.1", "1") > 0)
  }

  @Test("only this app's tags are read")
  func tagPrefix() {
    #expect(version(fromTag: "akbun-mactaskbar-v0.2.0") == "0.2.0")
    #expect(version(fromTag: "akbun-screenshot-v1.0.0") == nil)
  }

  /// Installing the wrong slice leaves an app that cannot launch, so no match
  /// has to mean no update rather than a guess.
  @Test("the dmg is picked by architecture")
  func dmgByArch() {
    let assets = [
      "akbun-mactaskbar-0.2.0-arm64.dmg",
      "akbun-mactaskbar-0.2.0-x86_64.dmg",
      "source.zip",
    ]
    #expect(pickDmg(assetNames: assets, arch: "arm64") == "akbun-mactaskbar-0.2.0-arm64.dmg")
    #expect(pickDmg(assetNames: assets, arch: "x86_64") == "akbun-mactaskbar-0.2.0-x86_64.dmg")
  }

  @Test("no dmg for this architecture means no update")
  func noMatchingDmg() {
    #expect(pickDmg(assetNames: ["akbun-mactaskbar-0.2.0-arm64.dmg"], arch: "x86_64") == nil)
    #expect(pickDmg(assetNames: ["notes.txt"], arch: "arm64") == nil)
  }
}
