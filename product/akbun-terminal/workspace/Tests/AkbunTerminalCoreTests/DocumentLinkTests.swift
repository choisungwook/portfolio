import Foundation
import Testing

@testable import AkbunTerminalCore

/// What a command click on a link in a rendered document does. The rule is the
/// interesting part, so it is asked here instead of through a text view.
struct DocumentLinkTests {
  @Test func aMarkdownNameIsToldFromEveryOtherFile() {
    #expect(DocumentLink.isMarkdown("/p/README.md"))
    #expect(DocumentLink.isMarkdown("/p/NOTES.Markdown"))
    #expect(!DocumentLink.isMarkdown("/p/main.swift"))
    #expect(!DocumentLink.isMarkdown("/p/Makefile"))
  }

  @Test func aSiblingDocumentResolvesAgainstTheOpenFile() {
    #expect(
      DocumentLink.resolve("guide.md", from: "/p/docs/index.md")
        == .document(path: "/p/docs/guide.md"))
  }

  @Test func aRelativeTargetCanClimbOutOfItsFolder() {
    #expect(
      DocumentLink.resolve("../README.md", from: "/p/docs/index.md")
        == .document(path: "/p/README.md"))
  }

  @Test func anAbsoluteTargetIsTakenAsWritten() {
    #expect(
      DocumentLink.resolve("/other/notes.markdown", from: "/p/docs/index.md")
        == .document(path: "/other/notes.markdown"))
  }

  @Test func whatFollowsTheFileNameIsForTheRendererNotTheFileSystem() {
    #expect(
      DocumentLink.resolve("guide.md#install", from: "/p/docs/index.md")
        == .document(path: "/p/docs/guide.md"))
    #expect(
      DocumentLink.resolve("my%20guide.md", from: "/p/docs/index.md")
        == .document(path: "/p/docs/my guide.md"))
  }

  @Test func anAddressWithASchemeIsTheBrowsersToOpen() {
    #expect(
      DocumentLink.resolve("https://akbun.com/docs", from: "/p/docs/index.md")
        == .external(url: URL(string: "https://akbun.com/docs")!))
  }

  @Test func aSourceFileBesideTheDocumentOpensToo() {
    // Every file opens in a tab now, so a link to one is no longer a link to
    // nowhere. It was refused for want of an editor, never for safety.
    #expect(
      DocumentLink.resolve("../Sources/main.swift", from: "/p/docs/index.md")
        == .document(path: "/p/Sources/main.swift"))
  }

  @Test func nothingIsOpenedForALinkThisWindowCannotShow() {
    // A jump inside the page, a folder, a name with no file in it, and an empty
    // target.
    #expect(DocumentLink.resolve("#install", from: "/p/docs/index.md") == nil)
    #expect(DocumentLink.resolve("../src/", from: "/p/docs/index.md") == nil)
    #expect(DocumentLink.resolve("installation", from: "/p/docs/index.md") == nil)
    #expect(DocumentLink.resolve("   ", from: "/p/docs/index.md") == nil)
    // Only the two schemes the terminal's own URL rule allows leave the app.
    #expect(DocumentLink.resolve("mailto:someone@example.com", from: "/p/docs/index.md") == nil)
  }
}
