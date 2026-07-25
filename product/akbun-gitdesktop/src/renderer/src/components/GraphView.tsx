import { useEffect, useMemo, useState, type JSX } from 'react'
import type { CommitInfo } from '../../../shared/types'
import { layoutGraph } from '../lib/graphLayout'

const ROW_HEIGHT = 28
const LANE_WIDTH = 16
const NODE_RADIUS = 4
const COLORS = ['#e06c75', '#61afef', '#98c379', '#c678dd', '#d19a66', '#56b6c2', '#be5046', '#528bff']

interface Props {
  repoPath: string
}

export default function GraphView({ repoPath }: Props): JSX.Element {
  const [commits, setCommits] = useState<CommitInfo[]>([])
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    setCommits([])
    setLoadError('')
    window.gitdesktop.getLog(repoPath).then((result) => {
      if (result.ok) {
        setCommits(result.data)
      } else {
        setLoadError(result.error)
      }
    })
  }, [repoPath])

  const layout = useMemo(() => layoutGraph(commits), [commits])
  const graphWidth = (layout.laneCount + 1) * LANE_WIDTH

  const laneX = (lane: number): number => LANE_WIDTH / 2 + lane * LANE_WIDTH
  const rowY = (row: number): number => ROW_HEIGHT / 2 + row * ROW_HEIGHT
  const colorOf = (index: number): string => COLORS[index % COLORS.length]

  if (loadError) {
    return <div className="graph-view error-banner">{loadError}</div>
  }

  return (
    <div className="graph-view">
      <svg
        className="graph-svg"
        width={graphWidth}
        height={commits.length * ROW_HEIGHT}
        style={{ minWidth: graphWidth }}
      >
        {layout.segments.map((segment, index) => {
          const x1 = laneX(segment.fromLane)
          const y1 = rowY(segment.row)
          const x2 = laneX(segment.toLane)
          const y2 = rowY(segment.row + 1)
          const path =
            x1 === x2
              ? `M ${x1} ${y1} L ${x2} ${y2}`
              : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`
          return <path key={index} d={path} stroke={colorOf(segment.color)} strokeWidth={2} fill="none" />
        })}
        {layout.nodes.map((node) => (
          <circle
            key={node.commit.hash}
            cx={laneX(node.lane)}
            cy={rowY(node.row)}
            r={NODE_RADIUS}
            fill={colorOf(node.color)}
          />
        ))}
      </svg>
      <div className="commit-rows">
        {layout.nodes.map((node) => (
          <div key={node.commit.hash} className="commit-row" style={{ height: ROW_HEIGHT }}>
            <span className="commit-refs">
              {node.commit.refs.map((ref) => (
                <em key={ref} className={refClass(ref)}>
                  {ref.replace('HEAD -> ', '')}
                </em>
              ))}
            </span>
            <span className="commit-subject" title={node.commit.subject}>
              {node.commit.subject}
            </span>
            <span className="commit-author">{node.commit.author}</span>
            <span className="commit-date">{node.commit.date}</span>
            <span className="commit-hash">{node.commit.hash.slice(0, 7)}</span>
          </div>
        ))}
      </div>
      {commits.length === 0 && <p className="placeholder">커밋을 불러오는 중이거나 커밋이 없습니다.</p>}
    </div>
  )
}

function refClass(ref: string): string {
  if (ref.startsWith('tag:')) return 'ref-tag'
  if (ref.startsWith('HEAD')) return 'ref-head'
  if (ref.includes('/')) return 'ref-remote'
  return 'ref-local'
}
