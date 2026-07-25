import { useEffect, useState, type JSX } from 'react'
import type { PullRequestInfo } from '../../../shared/types'

interface Props {
  repoPath: string
}

export default function PrPanel({ repoPath }: Props): JSX.Element {
  const [prs, setPrs] = useState<PullRequestInfo[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setLoadError('')
    window.gitdesktop.getPullRequests(repoPath).then((result) => {
      setLoading(false)
      if (result.ok) {
        setPrs(result.data)
      } else {
        setLoadError(
          `Could not load pull requests. Check that gh is installed and that gh auth login has been run.\n${result.error}`
        )
      }
    })
  }, [repoPath])

  if (loading) return <p className="placeholder">Loading pull requests...</p>
  if (loadError) return <div className="error-banner">{loadError}</div>

  return (
    <ul className="pr-list">
      {prs.map((pr) => (
        <li key={pr.number}>
          <span className={`pr-state pr-state-${pr.state.toLowerCase()}`}>{pr.state}</span>
          <a
            href={pr.url}
            onClick={(event) => {
              event.preventDefault()
              window.gitdesktop.openExternal(pr.url)
            }}
          >
            #{pr.number} {pr.title}
          </a>
          <span className="pr-meta">
            {pr.author} · {pr.headRefName} · {pr.updatedAt.slice(0, 10)}
          </span>
        </li>
      ))}
      {prs.length === 0 && <li className="placeholder">No pull requests.</li>}
    </ul>
  )
}
