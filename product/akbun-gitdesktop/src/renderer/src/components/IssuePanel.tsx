import { useEffect, useMemo, useState, type JSX } from 'react'
import type { IssueInfo } from '../../../shared/types'
import { clickable } from '../lib/clickable'
import { buildIssueTree, ghErrorMessage, shortDate, stateClass } from '../lib/github'

/** Indent per tree level, wide enough for the connector to read as a corner. */
const INDENT_PX = 22

interface Props {
  repoPath: string
  selectedNumber: number
  onSelect: (issue: IssueInfo) => void
}

export default function IssuePanel({ repoPath, selectedNumber, onSelect }: Props): JSX.Element {
  const [issues, setIssues] = useState<IssueInfo[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    window.gitdesktop.getIssues(repoPath).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (result.ok) {
        setIssues(result.data)
      } else {
        setLoadError(ghErrorMessage('issues', result.error))
      }
    })
    return () => {
      cancelled = true
    }
  }, [repoPath])

  const rows = useMemo(() => buildIssueTree(issues), [issues])

  if (loading) return <p className="placeholder">Loading issues...</p>
  if (loadError) return <div className="error-banner">{loadError}</div>

  return (
    <ul className="pr-list issue-tree">
      {rows.map((row) => (
        <li
          key={row.issue.number}
          className={row.issue.number === selectedNumber ? 'selected' : ''}
          style={{ paddingLeft: 6 + row.depth * INDENT_PX }}
          {...clickable(() => onSelect(row.issue))}
          title={`Show issue #${row.issue.number}`}
        >
          {row.depth > 0 && (
            <span className="issue-rails" aria-hidden="true">
              {row.guides.map((keepsGoing, level) => (
                <span key={level} className={keepsGoing ? 'issue-rail through' : 'issue-rail'} />
              ))}
              <span className={row.isLast ? 'issue-rail elbow last' : 'issue-rail elbow'} />
            </span>
          )}
          <span className={stateClass(row.issue.state)}>{row.issue.state}</span>
          <span className="pr-title">
            #{row.issue.number} {row.issue.title}
          </span>
          {row.childCount > 0 && (
            <span className="issue-sub-count" title={`${row.childCount} sub-issues`}>
              ↳ {row.childCount}
            </span>
          )}
          {row.detachedParent > 0 && (
            <span className="pr-meta" title="The parent issue is outside this list">
              ↰ #{row.detachedParent}
            </span>
          )}
          {row.issue.labels.map((label) => (
            <span key={label} className="label-chip">
              {label}
            </span>
          ))}
          <span className="pr-meta">
            {row.issue.author} · {shortDate(row.issue.updatedAt)}
          </span>
          <button
            className="icon-button"
            title="Open on GitHub"
            aria-label={`Open issue ${row.issue.number} on GitHub`}
            onClick={(event) => {
              event.stopPropagation()
              window.gitdesktop.openExternal(row.issue.url)
            }}
          >
            ↗
          </button>
        </li>
      ))}
      {rows.length === 0 && <li className="placeholder">No issues.</li>}
    </ul>
  )
}
