import AppKit
import AkbunTerminalCore
import Highlighter

/// Highlight.js behind the one attributed-string shape the native reader needs.
///
/// Language grammars and their edge cases belong to Highlight.js. This adapter
/// only supplies a file-name hint, chooses the closest application theme and
/// removes the library's page background so the document keeps the window's
/// palette.
@MainActor
final class CodeHighlighter {
  struct Result {
    let text: NSAttributedString
    let language: String
  }

  private static let maximumBytes = 512 * 1024
  private let engine = Highlighter()
  private lazy var supportedLanguages = Set(engine?.supportedLanguages() ?? [])

  init() {
    engine?.ignoreIllegals = true
  }

  func render(source: String, path: String, zoom: Zoom, palette: Palette) -> Result {
    let hint = languageHint(for: path)
    guard source.utf8.count <= Self.maximumBytes, let engine else {
      return Result(text: plain(source, zoom: zoom, palette: palette), language: hint ?? "Plain text")
    }

    let font = NSFont.monospacedSystemFont(ofSize: zoom.size(12), weight: .regular)
    _ = engine.setTheme(
      palette.resolvedSyntaxTheme, withFont: font.fontName, ofSize: font.pointSize)
    let highlighted = engine.highlight(source, as: hint) ?? engine.highlight(source)
    guard let highlighted else {
      return Result(text: plain(source, zoom: zoom, palette: palette), language: "Plain text")
    }

    let result = NSMutableAttributedString(attributedString: highlighted)
    let range = NSRange(location: 0, length: result.length)
    result.removeAttribute(.backgroundColor, range: range)
    result.addAttribute(.paragraphStyle, value: paragraph(zoom), range: range)
    return Result(text: result, language: hint?.uppercased() ?? "Auto detected")
  }

  private func languageHint(for path: String) -> String? {
    let name = (path as NSString).lastPathComponent.lowercased()
    let named = [
      "dockerfile": "dockerfile",
      "gemfile": "ruby",
      "makefile": "makefile",
      "package.resolved": "json",
    ]
    if let language = named[name] { return language }

    let suffix = (path as NSString).pathExtension.lowercased()
    guard !suffix.isEmpty else { return nil }
    let aliases = [
      "bash": "bash", "cjs": "javascript", "htm": "xml", "html": "xml",
      "jsx": "javascript", "mdown": "markdown", "mjs": "javascript",
      "mkd": "markdown", "pyw": "python", "sh": "bash", "tsx": "typescript",
      "yml": "yaml", "zsh": "bash",
    ]
    return aliases[suffix] ?? (supportedLanguages.contains(suffix) ? suffix : nil)
  }

  private func plain(_ source: String, zoom: Zoom, palette: Palette) -> NSAttributedString {
    NSAttributedString(
      string: source,
      attributes: [
        .font: NSFont.monospacedSystemFont(ofSize: zoom.size(12), weight: .regular),
        .foregroundColor: palette.text,
        .paragraphStyle: paragraph(zoom),
      ])
  }

  private func paragraph(_ zoom: Zoom) -> NSParagraphStyle {
    let style = NSMutableParagraphStyle()
    style.headIndent = zoom.size(24)
    style.lineHeightMultiple = 1.15
    return style
  }
}
