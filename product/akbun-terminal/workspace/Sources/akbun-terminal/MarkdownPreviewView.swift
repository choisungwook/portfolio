import AppKit
import AkbunTerminalCore
import WebKit

@MainActor
final class MarkdownPreviewView: WKWebView, WKNavigationDelegate {
  enum Failure: LocalizedError {
    case missingResource(String)

    var errorDescription: String? {
      switch self {
      case .missingResource(let name):
        "The Markdown preview resource \(name) is missing"
      }
    }
  }

  var onError: ((Error) -> Void)?
  var onOpenLink: ((String) -> Void)?
  private var documentPath: String?

  init() {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
    super.init(frame: .zero, configuration: configuration)
    navigationDelegate = self
    underPageBackgroundColor = .clear
  }

  required init?(coder: NSCoder) {
    fatalError("not loaded from a nib")
  }

  func render(source: String, path: String, palette: Palette, zoom: Zoom) {
    do {
      documentPath = path
      let page = MarkdownPage.html(
        source: source,
        style: MarkdownPage.Style(
          background: palette.background.cssHex,
          panel: palette.panel.cssHex,
          text: palette.text.cssHex,
          secondaryText: palette.secondaryText.cssHex,
          accent: palette.accent.cssHex,
          fontSize: zoom.size(13),
          dark: palette.isDark
        ),
        highlightStyle: try resource(
          named: palette.resolvedSyntaxTheme, withExtension: "css",
          subdirectory: "Resources/Styles"),
        markdownScript: try script(named: "markdown-it.min"),
        highlightScript: try script(named: "highlight.min"),
        mermaidScript: try script(named: "mermaid.min")
      )
      let folder = URL(fileURLWithPath: (path as NSString).deletingLastPathComponent)
      loadHTMLString(page, baseURL: folder)
    } catch {
      onError?(error)
    }
  }

  func find(_ query: String, index: Int?, completion: @escaping (Int, Int?) -> Void) {
    guard !query.isEmpty else {
      evaluateJavaScript("window.akbunFind('', 0)") { _, _ in completion(0, nil) }
      return
    }
    let encoded = (try? String(data: JSONEncoder().encode(query), encoding: .utf8)) ?? "\"\""
    let asked = index.map(String.init) ?? "null"
    evaluateJavaScript("window.akbunFind(\(encoded), \(asked))") { value, _ in
      guard let result = value as? [String: Any], let total = result["total"] as? Int else {
        completion(0, nil)
        return
      }
      completion(total, result["index"] as? Int)
    }
  }

  private func script(named name: String) throws -> String {
    try resource(named: name, withExtension: "js", subdirectory: "Resources")
  }

  private func resource(
    named name: String, withExtension suffix: String, subdirectory: String
  ) throws -> String
  {
    guard let url = Bundle.module.url(
      forResource: name, withExtension: suffix, subdirectory: subdirectory)
    else {
      throw Failure.missingResource("\(name).\(suffix)")
    }
    return try String(contentsOf: url, encoding: .utf8)
  }

  func webView(
    _ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
  ) {
    guard navigationAction.navigationType == .linkActivated,
      let url = navigationAction.request.url
    else {
      decisionHandler(.allow)
      return
    }
    if url.isFileURL, url.path == documentPath, url.fragment != nil {
      decisionHandler(.allow)
      return
    }
    onOpenLink?(url.absoluteString)
    decisionHandler(.cancel)
  }

  func webView(
    _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    onError?(error)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    onError?(error)
  }
}
