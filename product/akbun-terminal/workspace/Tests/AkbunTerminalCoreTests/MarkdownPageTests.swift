import Foundation
import Testing

@testable import AkbunTerminalCore

struct MarkdownPageTests {
  private let style = MarkdownPage.Style(
    background: "#ffffff", panel: "#eeeeee", text: "#111111",
    secondaryText: "#666666", accent: "#0066cc", fontSize: 13, dark: false)

  @Test func documentHTMLCannotBecomeApplicationCode() {
    let page = MarkdownPage.html(
      source: "</pre><script>alert(1)</script>", style: style,
      highlightStyle: ".hljs-keyword { color: red; }",
      markdownScript: "// markdown-it", highlightScript: "// highlight",
      mermaidScript: "// mermaid")
    #expect(!page.contains("<script>alert(1)</script>"))
    #expect(page.contains("&lt;/pre&gt;"))
    #expect(page.contains("html: false"))
  }

  @Test func onlyBundledRenderingScriptsAreAllowed() {
    let page = MarkdownPage.html(
      source: "# Title", style: style, highlightStyle: "", markdownScript: "// markdown-it",
      highlightScript: "// highlight", mermaidScript: "// mermaid")
    #expect(page.contains("default-src 'none'"))
    #expect(page.contains("connect-src 'none'"))
    #expect(page.contains("securityLevel: 'strict'"))
  }

  @Test func pageUsesTheApplicationPalette() {
    let page = MarkdownPage.html(
      source: "# Title", style: style, highlightStyle: ".hljs-keyword { color: red; }",
      markdownScript: "", highlightScript: "",
      mermaidScript: "")
    #expect(page.contains("background: #ffffff"))
    #expect(page.contains("color: #111111"))
    #expect(page.contains("color: #0066cc"))
    #expect(page.contains(".hljs-keyword { color: red; }"))
  }
}
