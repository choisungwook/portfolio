import AppKit
import AkbunTerminalCore

/// Blocks from the core to one attributed string.
///
/// The text colour is handed in rather than looked up, because a document tab
/// fills the same area as a terminal and has to wear the same theme: semantic
/// colours would draw black text on a Dracula background. The quieter shades are
/// that colour faded towards the background, which is one colour to pass instead
/// of four. Nothing here parses markdown; by the time a block arrives the
/// decisions have already been made in the core.
struct MarkdownAttributedText {
  /// Where a span's link is kept. Deliberately not `.link`, because that
  /// attribute makes a plain click open the destination, and a document someone
  /// else wrote should not open anything just because the pointer passed over
  /// it. A command click reads this key instead, which is a gesture nobody
  /// makes by accident.
  static let linkKey = NSAttributedString.Key("io.akbun.terminal.link")

  let zoom: Zoom
  let colour: NSColor

  static func build(_ blocks: [CoreBlock], zoom: Zoom = Zoom(), colour: NSColor = .textColor)
    -> NSAttributedString
  {
    MarkdownAttributedText(zoom: zoom, colour: colour).build(blocks)
  }

  /// A quote, a table, a rule: present but not what is being read.
  private var quiet: NSColor { colour.withAlphaComponent(0.6) }
  private var quietest: NSColor { colour.withAlphaComponent(0.35) }

  func build(_ blocks: [CoreBlock]) -> NSAttributedString {
    let document = NSMutableAttributedString()
    for block in blocks {
      switch block {
      case .heading(let level, let spans):
        let size = max(13.0, 24.0 - Double(level) * 2.5)
        append(spans, to: document, base: .systemFont(ofSize: zoom.size(size), weight: .semibold))
      case .paragraph(let spans):
        append(spans, to: document, base: body)
      case .quote(let spans):
        append(spans, to: document, base: body, indent: 18, color: quiet)
      case .listItem(let depth, let marker, let spans):
        let bullet = marker.isEmpty ? "" : "\(marker) "
        append(
          spans, to: document, base: body, indent: 18 + Double(depth) * 16, prefix: bullet)
      case .code(_, let text):
        // The language is not drawn: highlighting is a code editor's job, and
        // this view is for reading documents.
        appendLine(text, to: document, font: monospace, indent: 18, color: colour)
      case .table(let header, let rows):
        appendLine(
          Self.table(header: header, rows: rows), to: document, font: monospace, indent: 12,
          color: quiet)
      case .rule:
        appendLine(String(repeating: "─", count: 40), to: document, font: body,
          indent: 0, color: quietest)
      case .unknown:
        continue
      }
    }
    return document
  }

  private var body: NSFont { .systemFont(ofSize: zoom.size(13)) }
  private var monospace: NSFont { .monospacedSystemFont(ofSize: zoom.size(12), weight: .regular) }

  private func append(
    _ spans: [CoreSpan], to document: NSMutableAttributedString, base: NSFont,
    indent: Double = 0, prefix: String = "", color: NSColor? = nil
  ) {
    let color = color ?? colour
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
        attributes[.font] = Self.styled(base, bold: span.bold, italic: span.italic)
      }
      if let link = span.link {
        // Drawn as a link and carrying its destination, which is what a command
        // click asks for and what the tooltip shows to anyone else.
        attributes[.foregroundColor] = NSColor.linkColor
        attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
        attributes[.toolTip] = link
        attributes[Self.linkKey] = link
      }
      line.append(NSAttributedString(string: span.text, attributes: attributes))
    }
    line.append(NSAttributedString(string: "\n"))
    line.addAttribute(
      .paragraphStyle, value: paragraph(indent: indent), range: NSRange(location: 0, length: line.length))
    document.append(line)
  }

  private func appendLine(
    _ text: String, to document: NSMutableAttributedString, font: NSFont, indent: Double,
    color: NSColor
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

  /// Indents follow the zoom too. Left alone they would be a hair's width at a
  /// large font, which reads as a list that lost its shape.
  private func paragraph(indent: Double) -> NSParagraphStyle {
    let style = NSMutableParagraphStyle()
    style.headIndent = zoom.size(indent)
    style.firstLineHeadIndent = zoom.size(indent)
    style.paragraphSpacing = zoom.size(6)
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
