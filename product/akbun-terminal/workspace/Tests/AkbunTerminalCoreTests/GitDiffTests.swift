import Testing
@testable import AkbunTerminalCore

struct GitDiffTests {
  private let patch = """
    diff --git a/a.txt b/a.txt
    index 1111111..2222222 100644
    --- a/a.txt
    +++ b/a.txt
    @@ -3,4 +3,5 @@ context heading
     kept
    -gone
    +new
    +also new
     tail
    """

  @Test func tellsTheThreeKindsOfLineApart() {
    let lines = GitDiff.lines(patch)
    #expect(lines.prefix(4).allSatisfy { $0.kind == .header })
    #expect(lines[4].kind == .hunk)
    #expect(lines.filter { $0.kind == .added }.map(\.text) == ["+new", "+also new"])
    #expect(lines.filter { $0.kind == .removed }.map(\.text) == ["-gone"])
  }

  @Test func numbersFollowTheHunkHeaderRatherThanTheTopOfTheFile() {
    // The patch starts at line 3 of the file, and a line that only one side has
    // carries only that side's number.
    let lines = GitDiff.lines(patch)
    let kept = lines[5]
    #expect(kept.oldLine == 3 && kept.newLine == 3)
    let removed = lines.first { $0.kind == .removed }
    #expect(removed?.oldLine == 4 && removed?.newLine == nil)
    let added = lines.first { $0.kind == .added }
    #expect(added?.newLine == 4 && added?.oldLine == nil)
    // Two additions and one removal later, the sides have drifted apart.
    let tail = lines.last
    #expect(tail?.oldLine == 5 && tail?.newLine == 6)
  }

  @Test func aHunkOfOneLineLeavesItsCountOut() {
    let lines = GitDiff.lines("@@ -7 +9 @@\n+one\n")
    #expect(lines.count == 2)
    #expect(lines[1].newLine == 9)
  }

  @Test func theMissingNewlineMarkerIsNotALineOfEitherSide() {
    let lines = GitDiff.lines("@@ -1,2 +1,2 @@\n-old\n\\ No newline at end of file\n+new\n")
    #expect(lines.map(\.kind) == [.hunk, .removed, .context, .added])
    #expect(lines[3].newLine == 1)
  }
}
