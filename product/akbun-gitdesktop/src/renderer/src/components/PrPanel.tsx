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
        setLoadError(`PR을 불러오지 못했습니다. gh CLI 설치와 gh auth login 상태를 확인하세요.\n${result.error}`)
      }
    })
  }, [repoPath])

  if (loading) return <p className="placeholder">PR을 불러오는 중...</p>
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
      {prs.length === 0 && <li className="placeholder">PR이 없습니다.</li>}
    </ul>
  )
}
