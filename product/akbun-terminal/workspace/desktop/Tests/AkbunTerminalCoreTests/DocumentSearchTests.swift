import Foundation
import Testing

@testable import AkbunTerminalCore

/// Command F over the file on screen. The ranges and the wrapping are asked
/// here, because an off by one in a find bar is invisible until somebody is
/// halfway down a file looking for the match that was skipped.
struct DocumentSearchTests {
  private let text = "one two one three ONE"

  @Test func everyOccurrenceIsFoundWhateverCaseItIsIn() {
    let matches = DocumentSearch.matches(of: "one", in: text)
    #expect(matches.count == 3)
    #expect(matches.map(\.location) == [0, 8, 18])
  }

  @Test func anEmptyQueryMatchesNothingRatherThanEverything() {
    #expect(DocumentSearch.matches(of: "", in: text).isEmpty)
    #expect(DocumentSearch.matches(of: "four", in: text).isEmpty)
  }

  @Test func aRepeatedPhraseIsReachableAtEveryOffset() {
    // Stepping past the whole match would report one "aa" in "aaa".
    #expect(DocumentSearch.matches(of: "aa", in: "aaa").map(\.location) == [0, 1])
  }

  @Test func theNextMatchWrapsRoundRatherThanStopping() {
    let matches = DocumentSearch.matches(of: "one", in: text)
    #expect(DocumentSearch.next(after: 0, in: matches) == 1)
    #expect(DocumentSearch.next(after: 18, in: matches) == 0)
    #expect(DocumentSearch.previous(before: 8, in: matches) == 0)
    #expect(DocumentSearch.previous(before: 0, in: matches) == 2)
    #expect(DocumentSearch.next(after: 0, in: []) == nil)
  }

  @Test func theCounterCountsFromOneBecauseThatIsWhatIsRead() {
    #expect(DocumentSearch.summary(index: 0, total: 3) == "1 of 3")
    #expect(DocumentSearch.summary(index: nil, total: 3) == "3 matches")
    #expect(DocumentSearch.summary(index: nil, total: 0) == "No matches")
  }
}
