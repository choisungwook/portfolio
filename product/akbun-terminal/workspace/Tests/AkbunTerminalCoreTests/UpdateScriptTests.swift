import Testing
@testable import AkbunTerminalCore

/// The dmg is large and lands in a temp directory, so a leak fills the disk
/// quietly. Two of the three cleanup points live in the script; this test fails
/// if either is edited away.
struct UpdateScriptTests {
  @Test func theScriptCleansUpOnEveryExitPath() {
    #expect(UpdateScript.source.contains("trap cleanup EXIT"))
    #expect(UpdateScript.source.contains(#"rm -rf "$WORK""#))
  }

  @Test func theScriptUnmountsTheImage() {
    #expect(UpdateScript.source.contains("hdiutil detach"))
  }

  @Test func theScriptWaitsForTheAppToQuitBeforeReplacingIt() {
    // A running app cannot overwrite itself, so the wait is not optional.
    #expect(UpdateScript.source.contains(#"kill -0 "$PID""#))
  }

  @Test func aFailedCopyPutsThePreviousBundleBack() {
    #expect(UpdateScript.source.contains(#"mv "$APP.old" "$APP""#))
  }

  @Test func theSweepAndTheDownloadAgreeOnThePrefix() {
    // The launch sweep matches on this prefix, so a rename in one place without
    // the other would leave every dmg behind.
    #expect(Release.tempPrefix == "akbun-terminal-update-")
  }
}
