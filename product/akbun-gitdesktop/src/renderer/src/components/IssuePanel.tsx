import { useEffect, useState, type JSX } from 'react'
import type { IssueInfo } from '../../../shared/types'
import { clickable } from '../lib/clickable'
import { ghErrorMessage, shortDate, stateClass } from '../lib/github'

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

  if (loading) return <p className="placeholder">Loading issues...</p>
  if (loadError) return <div className="error-banner">{loadError}</div>

  return (
    <ul className="pr-list">
      {issues.map((issue) => (
        <li
          key={issue.number}
          className={issue.number === selectedNumber ? 'selected' : ''}
          {...clickable(() => onSelect(issue))}
          title={`Show issue #${issue.number}`}
        >
          <span className={stateClass(issue.state)}>{issue.state}</span>
          <span className="pr-title">
            #{issue.number} {issue.title}
          </span>
          {issue.labels.map((label) => (
            <span key={label} className="label-chip">
              {label}
            </span>
          ))}
          <span className="pr-meta">
            {issue.author} · {shortDate(issue.updatedAt)}
          </span>
          <button
            className="icon-button"
            title="Open on GitHub"
            aria-label={`Open issue ${issue.number} on GitHub`}
            onClick={(event) => {
              event.stopPropagation()
              window.gitdesktop.openExternal(issue.url)
            }}
          >
            ↗
          </button>
        </li>
      ))}
      {issues.length === 0 && <li className="placeholder">No issues.</li>}
    </ul>
  )
}
