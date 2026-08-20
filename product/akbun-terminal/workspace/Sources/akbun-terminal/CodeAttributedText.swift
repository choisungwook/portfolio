import AppKit
import AkbunTerminalCore

/// Coloured tokens from the core to one attributed string.
///
/// The counterpart of `MarkdownAttributedText`, and deliberately its twin: the
/// core decides what a run of text is, this decides what that looks like. No
/// lexing happens here, so a language added to the core's table needs no change
/// on this side at all.
///
/// The text is monospaced because it is source, and the whole file is one
/// string rather than a view per line: a text view already lays out, wraps and
/// selects, and a stack of five thousand labels does none of those.
///
/// On the main actor because a `Palette` is `NSColor`, which is not `Sendable`.
/// The same reason `Palette` itself says so.
@MainActor
struct CodeAttributedText {
  let zoom: Zoom
  let palette: Palette

  static func build(_ highlighted: CoreHighlighted, zoom: Zoom = Zoom(), palette: Palette)
    -> NSAttributedString
  {
    CodeAttributedText(zoom: zoom, palette: palette).build(highlighted.lines)
  }

  func build(_ lines: [[CoreToken]]) -> NSAttributedString {
    let document = NSMutableAttributedString()
    let font = NSFont.monospacedSystemFont(ofSize: zoom.size(12), weight: .regular)
    let style = paragraph
    for line in lines {
      for token in line {
        document.append(
          NSAttributedString(
            string: token.text,
            attributes: [
              .font: font,
              .foregroundColor: SyntaxColor.of(token.kind, in: palette),
              .paragraphStyle: style,
            ]))
      }
      document.append(
        NSAttributedString(
          string: "\n", attributes: [.font: font, .paragraphStyle: style]))
    }
    return document
  }

  /// Wrapped lines are indented under the line they belong to, so a long line
  /// that folds still reads as one line rather than as several.
  private var paragraph: NSParagraphStyle {
    let style = NSMutableParagraphStyle()
    style.headIndent = zoom.size(24)
    style.lineHeightMultiple = 1.15
    return style
  }
}

/// What a token kind is drawn in.
///
/// The families are the ones every editor has settled on, which is the reason to
/// reuse them: a green string and a faded comment are things a reader already
/// knows before opening this app. Comments and punctuation are the theme's own
/// text colour faded rather than a colour of their own, because they have to
/// recede on a light and a dark background alike and a fixed grey cannot do both.
@MainActor
enum SyntaxColor {
  static func of(_ kind: CoreTokenKind, in palette: Palette) -> NSColor {
    switch kind {
    case .plain: return palette.text
    case .comment: return palette.text.withAlphaComponent(0.45)
    case .punctuation: return palette.text.withAlphaComponent(0.75)
    case .string: return .systemGreen
    case .number: return .systemOrange
    case .keyword: return .systemPink
    case .type: return .systemTeal
    case .constant: return .systemPurple
    case .function: return .systemBlue
    case .key: return .systemIndigo
    }
  }
}
