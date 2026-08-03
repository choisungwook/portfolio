import { useEffect, useState, type JSX } from 'react'
import type { ThreadDetail } from '../../../shared/types'
import { ghErrorMessage, shortDate, stateClass } from '../lib/github'

/** Which issue or pull request the drawer is showing. */
export interface ThreadRef {
  kind: 'issue' | 'pr'
  repoPath: string
  number: number
  title: string
}

interface Props {
  thread: ThreadRef
  onClose: () => void
}

function loadThread(thread: ThreadRef): ReturnType<typeof window.gitdesktop.getIssueDetail> {
  return thread.kind === 'pr'
    ? window.gitdesktop.getPullRequestDetail(thread.repoPath, thread.number)
    : window.gitdesktop.getIssueDetail(thread.repoPath, thread.number)
}

function Labels({ labels }: { labels: string[] }): JSX.Element | null {
  if (labels.length === 0) return null
  return (
    <span className="label-row">
      {labels.map((label) => (
        <span key={label} className="label-chip">
          {label}
        </span>
      ))}
    </span>
  )
}

/**
 * Side panel that shows one issue or pull request: its body, its labels and its
 * comments. Bodies are GitHub Markdown and are shown as the plain text they are,
 * because rendering them would mean pulling a Markdown parser into the app.
 */
export default function ThreadDrawer({ thread, onClose }: Props): JSX.Element {
  const [detail, setDetail] = useState<ThreadDetail | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const key = `${thread.kind}:${thread.repoPath}:${thread.number}`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    setDetail(null)
    loadThread(thread).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (result.ok) {
        setDetail(result.data)
      } else {
        setLoadError(ghErrorMessage(thread.kind === 'pr' ? 'this pull request' : 'this issue', result.error))
      }
    })
    return () => {
      cancelled = true
    }
    // The thread object is rebuilt on every render, so depend on its identity key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const url = detail?.url ?? ''

  return (
    <aside className="diff-drawer">
      <div className="diff-drawer-header">
        <div className="diff-drawer-title">
          <strong title={detail?.title ?? thread.title}>{detail?.title ?? thread.title}</strong>
          <span className="diff-drawer-subtitle">
            {thread.kind === 'pr' ? 'pull request' : 'issue'} #{thread.number}
          </span>
        </div>
        {url && (
          <button onClick={() => window.gitdesktop.openExternal(url)} title="Open on GitHub">
            Open in browser
          </button>
        )}
        <button className="icon-button" onClick={onClose} aria-label="Close detail panel" title="Close">
          ✕
        </button>
      </div>

      {loading && <p className="placeholder">Loading...</p>}
      {loadError && <div className="error-banner">{loadError}</div>}

      {detail && (
        <div className="thread-body">
          <div className="thread-meta">
            <span className={stateClass(detail.state)}>{detail.state}</span>
            <span className="pr-meta">
              {detail.author} opened this on {shortDate(detail.createdAt)}
            </span>
            {detail.kind === 'pr' && detail.headRefName && (
              <span className="pr-meta">
                {detail.baseRefName} ← {detail.headRefName}
              </span>
            )}
            {detail.kind === 'pr' && detail.changedFiles > 0 && (
              <span className="pr-meta">
                {detail.changedFiles} files, +{detail.additions} −{detail.deletions}
              </span>
            )}
            {detail.assignees.length > 0 && (
              <span className="pr-meta">assigned to {detail.assignees.join(', ')}</span>
            )}
            <Labels labels={detail.labels} />
          </div>

          <article className="thread-card">
            <header>
              {detail.author} · {shortDate(detail.createdAt)}
            </header>
            <p className="thread-text">{detail.body.trim() || 'No description.'}</p>
          </article>

          {detail.comments.map((comment, index) => (
            <article className="thread-card" key={index}>
              <header>
                {comment.author} · {shortDate(comment.createdAt)}
              </header>
              <p className="thread-text">{comment.body.trim()}</p>
            </article>
          ))}

          {detail.comments.length === 0 && <p className="placeholder">No comments.</p>}
        </div>
      )}
    </aside>
  )
}
