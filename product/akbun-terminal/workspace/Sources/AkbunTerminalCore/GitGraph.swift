/// A commit dot placed on one row and one lane.
public struct GitGraphNode: Equatable, Sendable {
  public let row: Int
  public let lane: Int
  public let colour: Int
}

/// One line from the centre of `row` to the centre of the next row.
public struct GitGraphSegment: Equatable, Sendable {
  public let row: Int
  public let fromLane: Int
  public let toLane: Int
  public let colour: Int
}

public struct GitGraphLayout: Equatable, Sendable {
  public let nodes: [GitGraphNode]
  public let segments: [GitGraphSegment]
  public let laneCount: Int
}

/// Places a topologically ordered log into stable lanes. A lane remembers the
/// next parent hash it expects, which is enough to continue branches and join
/// merges without looking at the repository again.
public enum GitGraph {
  private struct ActiveLane {
    let expectedHash: String
    let colour: Int
    var previousLane: Int
  }

  public static func layout(_ commits: [CoreGitCommit]) -> GitGraphLayout {
    var nodes: [GitGraphNode] = []
    var segments: [GitGraphSegment] = []
    var lanes: [ActiveLane?] = []
    var laneCount = 0
    var nextColour = 0

    func firstFreeLane() -> Int {
      if let free = lanes.firstIndex(where: { $0 == nil }) {
        return free
      }
      lanes.append(nil)
      return lanes.count - 1
    }

    for (row, commit) in commits.enumerated() {
      let expecting = lanes.indices.filter { lanes[$0]?.expectedHash == commit.hash }
      let nodeLane: Int
      let colour: Int
      if let first = expecting.first, let lane = lanes[first] {
        nodeLane = first
        colour = lane.colour
      } else {
        nodeLane = firstFreeLane()
        colour = nextColour
        nextColour += 1
      }

      if row > 0 {
        for index in lanes.indices {
          guard var lane = lanes[index] else { continue }
          let target = lane.expectedHash == commit.hash ? nodeLane : index
          segments.append(
            GitGraphSegment(
              row: row - 1, fromLane: lane.previousLane, toLane: target, colour: lane.colour))
          lane.previousLane = target
          lanes[index] = lane
        }
      }

      for index in expecting {
        lanes[index] = nil
      }
      nodes.append(GitGraphNode(row: row, lane: nodeLane, colour: colour))

      for (parentIndex, parent) in commit.parents.enumerated() {
        if parentIndex == 0 {
          lanes[nodeLane] = ActiveLane(
            expectedHash: parent, colour: colour, previousLane: nodeLane)
          continue
        }
        if let existing = lanes.firstIndex(where: { $0?.expectedHash == parent }),
          let lane = lanes[existing]
        {
          segments.append(
            GitGraphSegment(
              row: row, fromLane: nodeLane, toLane: existing, colour: lane.colour))
          continue
        }
        let mergeLane = firstFreeLane()
        lanes[mergeLane] = ActiveLane(
          expectedHash: parent, colour: nextColour, previousLane: nodeLane)
        nextColour += 1
      }
      laneCount = max(laneCount, lanes.count)
    }

    return GitGraphLayout(nodes: nodes, segments: segments, laneCount: max(laneCount, 1))
  }
}
