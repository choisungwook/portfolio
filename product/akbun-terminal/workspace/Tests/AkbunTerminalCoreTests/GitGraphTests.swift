import Testing
@testable import AkbunTerminalCore

struct GitGraphTests {
  private func commit(_ hash: String, parents: [String] = []) -> CoreGitCommit {
    CoreGitCommit(
      hash: hash, parents: parents, author: "A", date: "2026-08-23", refs: [], subject: hash)
  }

  @Test func aStraightHistoryStaysInOneLane() {
    let layout = GitGraph.layout([
      commit("c", parents: ["b"]), commit("b", parents: ["a"]), commit("a"),
    ])
    #expect(layout.nodes.map(\.lane) == [0, 0, 0])
    #expect(layout.segments.map { ($0.fromLane, $0.toLane) }.allSatisfy { $0 == (0, 0) })
    #expect(layout.laneCount == 1)
  }

  @Test func aMergeOpensAndJoinsASecondLane() {
    let layout = GitGraph.layout([
      commit("m", parents: ["a", "b"]),
      commit("a", parents: ["r"]),
      commit("b", parents: ["r"]),
      commit("r"),
    ])
    #expect(layout.nodes.map(\.lane) == [0, 0, 1, 0])
    #expect(layout.laneCount == 2)
    #expect(layout.segments.contains { $0.fromLane == 0 && $0.toLane == 1 })
  }

  @Test func anEmptyLogStillReservesOneLane() {
    let layout = GitGraph.layout([])
    #expect(layout.nodes.isEmpty)
    #expect(layout.segments.isEmpty)
    #expect(layout.laneCount == 1)
  }
}
