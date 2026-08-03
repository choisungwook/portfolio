import { useEffect, useState, type JSX } from 'react'
import type { PullRequestInfo } from '../../../shared/types'
import { clickable } from '../lib/clickable'
import { ghErrorMessage, shortDate, stateClass } from '../lib/github'

interface Props {
  repoPath: string
  selectedNumber: number
  onSelect: (pr: PullRequestInfo) => void
}

export default function PrPanel({ repoPath, selectedNumber, onSelect }: Props): JSX.Element {
  const [prs, setPrs] = useState<PullRequestInfo[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    window.gitdesktop.getPullRequests(repoPath).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (result.ok) {
        setPrs(result.data)
      } else {
        setLoadError(ghErrorMessage('pull requests', result.error))
      }
    })
    return () => {
      cancelled = true
    }
  }, [repoPath])

  if (loading) return <p className="placeholder">Loading pull requests...</p>
  if (loadError) return <div className="error-banner">{loadError}</div>

  return (
    <ul className="pr-list">
      {prs.map((pr) => (
        <li
          key={pr.number}
          className={pr.number === selectedNumber ? 'selected' : ''}
          {...clickable(() => onSelect(pr))}
          title={`Show pull request #${pr.number}`}
        >
          <span className={stateClass(pr.state)}>{pr.state}</span>
          <span className="pr-title">
            #{pr.number} {pr.title}
          </span>
          {pr.labels.map((label) => (
            <span key={label} className="label-chip">
              {label}
            </span>
          ))}
          <span className="pr-meta">
            {pr.author} · {pr.headRefName} · {shortDate(pr.updatedAt)}
          </span>
          <button
            className="icon-button"
            title="Open on GitHub"
            aria-label={`Open pull request ${pr.number} on GitHub`}
            onClick={(event) => {
              event.stopPropagation()
              window.gitdesktop.openExternal(pr.url)
            }}
          >
            ↗
          </button>
        </li>
      ))}
      {prs.length === 0 && <li className="placeholder">No pull requests.</li>}
    </ul>
  )
}
