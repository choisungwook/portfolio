import AppKit
import AkbunTerminalCore

/// Blocks from the core to one attributed string.
///
/// The colours are all semantic, so the rendered document follows dark and light
/// mode the same way the rest of the window does. Nothing here parses markdown;
/// by the time a block arrives the decisions have already been made in the core.
enum MarkdownAttributedText {
  static func build(_ blocks: [CoreBlock]) -> NSAttributedString {
    let document = NSMutableAttributedString()
    for block in blocks {
      switch block {
      case .heading(let level, let spans):
        let size = max(13.0, 24.0 - Double(level) * 2.5)
        append(spans, to: document, base: .systemFont(ofSize: size, weight: .semibold))
      case .paragraph(let spans):
        append(spans, to: document, base: body)
      case .quote(let spans):
        append(spans, to: document, base: body, indent: 18, color: .secondaryLabelColor)
      case .listItem(let depth, let marker, let spans):
        let bullet = marker.isEmpty ? "" : "\(marker) "
        append(
          spans, to: document, base: body, indent: 18 + Double(depth) * 16, prefix: bullet)
      case .code(_, let text):
        // The language is not drawn: highlighting is a code editor's job, and
        // this view is for reading documents.
        appendLine(text, to: document, font: monospace, indent: 18, color: .textColor)
      case .table(let header, let rows):
        appendLine(table(header: header, rows: rows), to: document, font: monospace, indent: 12)
      case .rule:
        appendLine(String(repeating: "─", count: 40), to: document, font: body,
          indent: 0, color: .tertiaryLabelColor)
      case .unknown:
        continue
      }
    }
    return document
  }

  private static var body: NSFont { .systemFont(ofSize: 13) }
  private static var monospace: NSFont { .monospacedSystemFont(ofSize: 12, weight: .regular) }

  private static func append(
    _ spans: [CoreSpan], to document: NSMutableAttributedString, base: NSFont,
    indent: Double = 0, prefix: String = "", color: NSColor = .textColor
  ) {
    let line = NSMutableAttributedString()
    if !prefix.isEmpty {
      line.append(NSAttributedString(string: prefix, attributes: [.font: base, .foregroundColor: color]))
    }
    for span in spans {
      var attributes: [NSAttributedString.Key: Any] = [.foregroundColor: color]
      if span.code {
        attributes[.font] = NSFont.monospacedSystemFont(ofSize: base.pointSize - 1, weight: .regular)
        attributes[.foregroundColor] = NSColor.systemPink
      } else {
        attributes[.font] = styled(base, bold: span.bold, italic: span.italic)
      }
      if let link = span.link {
        // Text only. The destination is shown rather than made clickable, so a
        // document someone else wrote cannot open anything by being read.
        attributes[.foregroundColor] = NSColor.linkColor
        attributes[.toolTip] = link
      }
      line.append(NSAttributedString(string: span.text, attributes: attributes))
    }
    line.append(NSAttributedString(string: "\n"))
    line.addAttribute(
      .paragraphStyle, value: paragraph(indent: indent), range: NSRange(location: 0, length: line.length))
    document.append(line)
  }

  private static func appendLine(
    _ text: String, to document: NSMutableAttributedString, font: NSFont, indent: Double,
    color: NSColor = .secondaryLabelColor
  ) {
    document.append(
      NSAttributedString(
        string: text + "\n",
        attributes: [
          .font: font, .foregroundColor: color, .paragraphStyle: paragraph(indent: indent),
        ]))
  }

  private static func styled(_ font: NSFont, bold: Bool, italic: Bool) -> NSFont {
    var traits: NSFontTraitMask = []
    if bold { traits.insert(.boldFontMask) }
    if italic { traits.insert(.italicFontMask) }
    guard !traits.isEmpty else { return font }
    return NSFontManager.shared.convert(font, toHaveTrait: traits)
  }

  private static func paragraph(indent: Double) -> NSParagraphStyle {
    let style = NSMutableParagraphStyle()
    style.headIndent = indent
    style.firstLineHeadIndent = indent
    style.paragraphSpacing = 6
    return style
  }

  /// Columns padded to the widest cell. A monospaced block is what a table looks
  /// like in a terminal, and it costs no layout code.
  private static func table(header: [String], rows: [[String]]) -> String {
    let all = [header] + rows
    let columns = all.map(\.count).max() ?? 0
    let widths = (0..<columns).map { column in
      all.map { $0.indices.contains(column) ? $0[column].count : 0 }.max() ?? 0
    }
    func line(_ cells: [String]) -> String {
      (0..<columns)
        .map { column in
          let cell = cells.indices.contains(column) ? cells[column] : ""
          return cell.padding(toLength: max(widths[column], cell.count), withPad: " ", startingAt: 0)
        }
        .joined(separator: "  ")
    }
    let divider = widths.map { String(repeating: "─", count: $0) }.joined(separator: "  ")
    return ([line(header), divider] + rows.map(line)).joined(separator: "\n")
  }
}
