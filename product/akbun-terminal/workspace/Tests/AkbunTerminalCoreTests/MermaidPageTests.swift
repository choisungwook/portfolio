import Foundation
import Testing

@testable import AkbunTerminalCore

/// The page a diagram is drawn in. A mermaid block is text out of a file
/// somebody else wrote, so what matters here is that it stays text.
struct MermaidPageTests {
  @Test func theSourceCannotCloseItsOwnElement() {
    let page = MermaidPage.html(
      source: "</pre><script>alert(1)</script>", dark: false, script: "// mermaid")
    #expect(!page.contains("<script>alert(1)</script>"))
    #expect(page.contains("&lt;/pre&gt;"))
  }

  @Test func theSourceIsReadBackAsTextRatherThanInterpolatedIntoTheScript() {
    // A backtick or a quote in a diagram would end the string it was pasted
    // into, so it is never pasted into one.
    let page = MermaidPage.html(source: "graph TD\n  A[\"`x`\"] --> B", dark: false, script: "")
    #expect(page.contains("getElementById('source').textContent"))
    #expect(page.contains("&quot;"))
  }

  @Test func nothingInThePageMayReachAnywhereElse() {
    let page = MermaidPage.html(source: "graph TD", dark: false, script: "")
    #expect(page.contains("default-src 'none'"))
  }

  @Test func theDiagramFollowsTheWindowsOwnTheme() {
    #expect(MermaidPage.html(source: "graph TD", dark: true, script: "").contains("theme: 'dark'"))
    #expect(
      MermaidPage.html(source: "graph TD", dark: false, script: "").contains("theme: 'default'"))
  }
}
