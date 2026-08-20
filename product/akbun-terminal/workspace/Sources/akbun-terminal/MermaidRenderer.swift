import AppKit
import AkbunTerminalCore
import WebKit

/// Draws a mermaid diagram, once, into an image.
///
/// Mermaid is thirty thousand lines of layout that nobody is going to write
/// twice, so the diagram is drawn by mermaid itself in a web view that is never
/// on screen and photographed. What ends up in the document is an image in the
/// text flow: it selects, scrolls and prints like the rest of the page, and no
/// part of a document someone else wrote is left running in the window.
///
/// The page is built here rather than loaded from disk, with a content security
/// policy that allows nothing but the script this app put in it. The bundled
/// mermaid.min.js is inlined for the same reason: the view then has no reason to
/// reach the file system or the network at all, and a diagram that tried would
/// be refused by the policy rather than by anyone noticing.
///
/// The diagram source is not interpolated into the script. It is escaped into a
/// hidden element and read back with `textContent`, so a backtick or a quote in
/// a document cannot become code.
@MainActor
final class MermaidRenderer: NSObject, WKNavigationDelegate {
  /// A diagram already drawn. Keyed by everything that changes what it looks
  /// like, so a redraw for a zoom step does not reuse the small one.
  private struct Key: Hashable {
    let source: String
    let dark: Bool
    let width: Int
  }

  /// What one request is waiting for.
  private struct Request {
    let key: Key
    let completion: (NSImage?) -> Void
  }

  private var cache: [Key: NSImage] = [:]
  private var queue: [Request] = []
  private var running = false
  private var web: WKWebView?
  /// The view the offscreen web view is parked in. A web view outside a window
  /// does not lay out, and a snapshot of a view that never laid out is blank.
  private weak var host: NSView?

  init(host: NSView) {
    self.host = host
    super.init()
  }

  /// The bundled mermaid, or nil in a build that has no Resources folder — a
  /// bare `swift run` rather than the .app. The caller draws the source in its
  /// place, so a development build shows the code instead of an empty gap.
  static let script: String? = {
    guard let url = Bundle.main.url(forResource: "mermaid.min", withExtension: "js"),
      let text = try? String(contentsOf: url, encoding: .utf8)
    else { return nil }
    return text
  }()

  static var isAvailable: Bool { script != nil }

  /// Hands back the diagram, from the cache when it has been drawn before.
  ///
  /// The completion is called on the main actor, possibly before this returns
  /// when the answer was already known. Nil means mermaid refused the source,
  /// which is a diagram with a syntax error in it and not a failure of the app.
  func image(source: String, dark: Bool, width: CGFloat, completion: @escaping (NSImage?) -> Void) {
    guard Self.isAvailable else {
      completion(nil)
      return
    }
    let key = Key(source: source, dark: dark, width: Int(width.rounded()))
    if let image = cache[key] {
      completion(image)
      return
    }
    queue.append(Request(key: key, completion: completion))
    runNext()
  }

  /// One at a time. Two web views drawing at once is two copies of mermaid in
  /// memory, and a document with ten diagrams in it is not worth that.
  private func runNext() {
    guard !running, let request = queue.first, let host else { return }
    running = true

    let configuration = WKWebViewConfiguration()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
    let web = WKWebView(
      frame: NSRect(x: 0, y: 0, width: CGFloat(request.key.width), height: 400),
      configuration: configuration)
    web.navigationDelegate = self
    // In the view tree so it lays out, invisible so nobody sees it happen.
    web.alphaValue = 0
    web.isHidden = false
    host.addSubview(web, positioned: .below, relativeTo: nil)
    self.web = web
    web.loadHTMLString(Self.page(source: request.key.source, dark: request.key.dark), baseURL: nil)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    // The page draws after its own load handler, so it says when it is done
    // rather than this delegate guessing. Polling rather than a message
    // handler, because a diagram mermaid refuses never posts one and the reader
    // would wait for ever.
    poll(webView, attempt: 0)
  }

  func webView(
    _ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error
  ) {
    finish(nil)
  }

  /// How long a diagram is given before it is called a failure. Two seconds at
  /// twenty a second, which is far longer than mermaid takes and short enough
  /// that a document with a broken diagram in it still finishes drawing.
  private static let attempts = 40

  private func poll(_ webView: WKWebView, attempt: Int) {
    guard attempt < Self.attempts else {
      finish(nil)
      return
    }
    webView.evaluateJavaScript("window.akbunSize") { value, _ in
      MainActor.assumeIsolated {
        guard let reported = value as? [String: Any] else {
          Timer.scheduledTimer(withTimeInterval: 0.05, repeats: false) { _ in
            MainActor.assumeIsolated { self.poll(webView, attempt: attempt + 1) }
          }
          return
        }
        guard let width = reported["width"] as? Double, let height = reported["height"] as? Double,
          height > 1
        else {
          // The page said it could not draw this one.
          self.finish(nil)
          return
        }
        self.capture(webView, size: NSSize(width: width, height: height))
      }
    }
  }

  private func capture(_ webView: WKWebView, size: NSSize) {
    webView.frame = NSRect(origin: .zero, size: size)
    let configuration = WKSnapshotConfiguration()
    configuration.rect = NSRect(origin: .zero, size: size)
    webView.takeSnapshot(with: configuration) { image, _ in
      MainActor.assumeIsolated { self.finish(image) }
    }
  }

  private func finish(_ image: NSImage?) {
    guard running, !queue.isEmpty else { return }
    let request = queue.removeFirst()
    if let image {
      cache[request.key] = image
    }
    web?.removeFromSuperview()
    web = nil
    running = false
    request.completion(image)
    runNext()
  }

  /// The page mermaid runs in. The markup, the policy and the escaping are in
  /// the core package, where they can be tested without a web view.
  static func page(source: String, dark: Bool) -> String {
    MermaidPage.html(source: source, dark: dark, script: script ?? "")
  }
}
