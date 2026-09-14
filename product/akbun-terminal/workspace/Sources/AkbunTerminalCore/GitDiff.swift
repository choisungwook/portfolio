/// One line of a unified diff, already told apart from its neighbours.
///
/// The core hands the shell a patch as text, and text is not enough to draw:
/// a green line and a red line differ only by the first character, and the
/// numbers down the side are not in the patch at all. Reading it once here
/// keeps that out of the view and puts it where a test can see it.
public struct GitDiffLine: Equatable, Sendable {
  public enum Kind: Equatable, Sendable {
    /// `diff --git`, `index`, `---`, `+++`, and the mode lines around them.
    case header
    /// The `@@ -a,b +c,d @@` line that starts a hunk.
    case hunk
    case added
    case removed
    /// A line the change left alone, carried for context.
    case context
  }

  public let kind: Kind
  /// The line as it appears in the patch, marker included.
  public let text: String
  /// Where the line sits in the file before the change, when it is there.
  public let oldLine: Int?
  /// Where it sits after the change.
  public let newLine: Int?

  public init(kind: Kind, text: String, oldLine: Int? = nil, newLine: Int? = nil) {
    self.kind = kind
    self.text = text
    self.oldLine = oldLine
    self.newLine = newLine
  }
}

public enum GitDiff {
  /// Reads a patch into drawable lines.
  ///
  /// The numbering follows the hunk header rather than counting from the top of
  /// the file, because a patch only carries the parts that changed and a count
  /// from the top would be wrong from the second hunk onwards. Anything before
  /// the first hunk is a header and carries no number.
  public static func lines(_ patch: String) -> [GitDiffLine] {
    var result: [GitDiffLine] = []
    var old = 0
    var new = 0
    var started = false
    for text in patch.split(separator: "\n", omittingEmptySubsequences: false).map(String.init) {
      if text.hasPrefix("@@") {
        started = true
        let counters = hunkStart(text)
        old = counters.old
        new = counters.new
        result.append(GitDiffLine(kind: .hunk, text: text))
        continue
      }
      guard started else {
        result.append(GitDiffLine(kind: .header, text: text))
        continue
      }
      switch text.first {
      case "+":
        result.append(GitDiffLine(kind: .added, text: text, newLine: new))
        new += 1
      case "-":
        result.append(GitDiffLine(kind: .removed, text: text, oldLine: old))
        old += 1
      case "\\":
        // "\ No newline at end of file" belongs to the line above and is not a
        // line of either side, so it moves neither counter.
        result.append(GitDiffLine(kind: .context, text: text))
      default:
        result.append(GitDiffLine(kind: .context, text: text, oldLine: old, newLine: new))
        old += 1
        new += 1
      }
    }
    // A patch ends with a newline, which splits into a last empty piece that is
    // not a line of the diff.
    if result.last?.text.isEmpty == true {
      result.removeLast()
    }
    return result
  }

  /// The two starting line numbers in `@@ -12,7 +12,9 @@`. A hunk of one line
  /// leaves the count out, so only the number before the comma is read.
  private static func hunkStart(_ header: String) -> (old: Int, new: Int) {
    var old = 1
    var new = 1
    // Only the range pair is read. What follows the closing `@@` is the
    // enclosing function git guessed at, and it can hold anything.
    let ranges = header.dropFirst(2).prefix { $0 != "@" }
    for field in ranges.split(separator: " ") {
      guard let sign = field.first, sign == "-" || sign == "+" else { continue }
      let number = Int(field.dropFirst().prefix(while: \.isNumber)) ?? 1
      if sign == "-" {
        old = number
      } else {
        new = number
      }
    }
    return (old, new)
  }
}
