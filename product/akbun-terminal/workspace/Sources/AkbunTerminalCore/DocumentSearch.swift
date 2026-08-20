import Foundation

/// Where a typed phrase appears in the file on screen.
///
/// Command F searches the buffer the view already has rather than asking the
/// core, because the core would be sent the whole file on every keystroke and
/// the answer is the same either way. The rule still does not belong in a view:
/// which matches there are, and which of them is next from where the cursor is,
/// are two questions a test can ask and a window cannot.
///
/// Matching is case insensitive and does no normalisation beyond that. A find
/// bar in an editor is expected to find what was typed, not what it resembles.
public enum DocumentSearch {
  /// Every match, in the order they appear. Ranges are UTF-16 offsets, which is
  /// what a text view lays out and selects with.
  public static func matches(of query: String, in text: String) -> [NSRange] {
    guard !query.isEmpty else { return [] }
    let haystack = text as NSString
    var found: [NSRange] = []
    var start = 0
    while start < haystack.length {
      let remaining = NSRange(location: start, length: haystack.length - start)
      let range = haystack.range(of: query, options: [.caseInsensitive], range: remaining)
      guard range.location != NSNotFound else { break }
      found.append(range)
      // One past the start rather than past the whole match, so overlapping
      // occurrences of a repeated phrase are all reachable.
      start = range.location + 1
    }
    return found
  }

  /// The match after `location`, wrapping round at the end. Nil only when there
  /// are no matches at all, because a find bar that stops at the last one reads
  /// as a find bar that stopped working.
  public static func next(after location: Int, in matches: [NSRange]) -> Int? {
    guard !matches.isEmpty else { return nil }
    return matches.firstIndex { $0.location > location } ?? 0
  }

  /// The match before `location`, wrapping round at the start.
  public static func previous(before location: Int, in matches: [NSRange]) -> Int? {
    guard !matches.isEmpty else { return nil }
    return matches.lastIndex { $0.location < location } ?? matches.count - 1
  }

  /// What the find bar says beside the field: which match of how many, or that
  /// there are none. Here rather than in the view because an off by one in a
  /// counter is exactly the kind of thing that ships.
  public static func summary(index: Int?, total: Int) -> String {
    guard total > 0 else { return "No matches" }
    guard let index else { return "\(total) matches" }
    return "\(index + 1) of \(total)"
  }
}
