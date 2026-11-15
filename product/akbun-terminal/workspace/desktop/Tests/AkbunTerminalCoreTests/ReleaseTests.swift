import Testing
@testable import AkbunTerminalCore

struct ReleaseTests {
  @Test func readsTheVersionOutOfThisProductsTag() {
    #expect(Release.version(fromTag: "akbun-terminal-v0.2.1") == "0.2.1")
  }

  @Test func ignoresAnotherProductsTag() {
    // Every product releases from this repository, so the check runs on tags it
    // must not treat as its own.
    #expect(Release.version(fromTag: "akbun-screenshot-v1.0.0") == nil)
    #expect(Release.version(fromTag: "akbun-terminal-v") == nil)
  }

  @Test func comparesVersionsAsNumbers() {
    // String comparison would call 0.10.0 older than 0.9.0 and stop offering
    // updates at the tenth release.
    #expect(Release.compare("0.10.0", "0.9.0") > 0)
    #expect(Release.compare("0.1.0", "0.1.0") == 0)
    #expect(Release.compare("1.0", "1.0.1") < 0)
  }

  @Test func picksTheDmgForThisArchitecture() {
    let assets = ["akbun-terminal-0.1.0-arm64.dmg", "akbun-terminal-0.1.0-x86_64.dmg"]
    #expect(Release.pickDmg(assetNames: assets, arch: "arm64") == "akbun-terminal-0.1.0-arm64.dmg")
  }

  @Test func fallsBackToTheOnlyDmgWhenTheNameCarriesNoArchitecture() {
    #expect(Release.pickDmg(assetNames: ["akbun-terminal-0.1.0.dmg"], arch: "arm64")
      == "akbun-terminal-0.1.0.dmg")
  }
}
