import type { CommitInfo } from '../../../shared/types'

export interface GraphNode {
  commit: CommitInfo
  row: number
  lane: number
  color: number
}

/** row에서 row+1로 내려가는 한 칸짜리 선분. fromLane과 toLane이 다르면 곡선으로 그린다. */
export interface GraphSegment {
  row: number
  fromLane: number
  toLane: number
  color: number
}

export interface GraphLayout {
  nodes: GraphNode[]
  segments: GraphSegment[]
  laneCount: number
}

interface ActiveLane {
  expectedHash: string
  color: number
  prevLane: number
}

/**
 * topo-order 커밋 목록(최신 우선)을 받아 각 커밋의 lane과
 * 행 사이를 잇는 선분 목록을 계산한다.
 * 각 lane은 "다음에 나타나야 할 commit hash"를 추적한다.
 */
export function layoutGraph(commits: CommitInfo[]): GraphLayout {
  const nodes: GraphNode[] = []
  const segments: GraphSegment[] = []
  const lanes: (ActiveLane | null)[] = []
  let laneCount = 0
  let nextColor = 0

  const firstFreeLane = (): number => {
    const free = lanes.findIndex((lane) => lane === null)
    if (free !== -1) return free
    lanes.push(null)
    return lanes.length - 1
  }

  commits.forEach((commit, row) => {
    const expecting = lanes.flatMap((lane, index) =>
      lane && lane.expectedHash === commit.hash ? [index] : []
    )

    let nodeLane: number
    let color: number
    if (expecting.length > 0) {
      nodeLane = expecting[0]
      color = lanes[nodeLane]!.color
    } else {
      nodeLane = firstFreeLane()
      color = nextColor++
    }

    // 이전 행에서 이번 행으로 내려오는 선분을 만든다.
    if (row > 0) {
      lanes.forEach((lane, index) => {
        if (!lane) return
        const target = lane.expectedHash === commit.hash ? nodeLane : index
        segments.push({ row: row - 1, fromLane: lane.prevLane, toLane: target, color: lane.color })
        lane.prevLane = target
      })
    }

    for (const index of expecting) {
      lanes[index] = null
    }

    nodes.push({ commit, row, lane: nodeLane, color })

    commit.parents.forEach((parent, parentIndex) => {
      if (parentIndex === 0) {
        lanes[nodeLane] = { expectedHash: parent, color, prevLane: nodeLane }
        return
      }
      const existing = lanes.findIndex((lane) => lane && lane.expectedHash === parent)
      if (existing !== -1) {
        // 이미 이 부모를 기다리는 lane이 있으면 merge 선분만 이어 준다.
        segments.push({ row, fromLane: nodeLane, toLane: existing, color: lanes[existing]!.color })
        return
      }
      const mergeLane = firstFreeLane()
      lanes[mergeLane] = { expectedHash: parent, color: nextColor++, prevLane: nodeLane }
    })

    laneCount = Math.max(laneCount, lanes.length)
  })

  return { nodes, segments, laneCount: Math.max(laneCount, 1) }
}
