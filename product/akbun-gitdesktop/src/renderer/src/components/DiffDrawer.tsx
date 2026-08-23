import { useEffect, useState, type JSX } from 'react'
import type { FileChange } from '../../../shared/types'
import { clickable } from '../lib/clickable'

/** What the drawer is diffing: one commit, or a branch against its base. */
export type DiffSource =
  | { kind: 'commit'; repoPath: string; hash: string; title: string; subtitle: string }
  | { kind: 'range'; repoPath: string; base: string; head: string; title: string; subtitle: string }

interface Props {
  source: DiffSource
  onClose: () => void
  width: number
}

function sourceKey(source: DiffSource): string {
  return source.kind === 'commit'
    ? `commit:${source.repoPath}:${source.hash}`
    : `range:${source.repoPath}:${source.base}:${source.head}`
}

function statusClass(status: string): string {
  const letter = status.charAt(0).toLowerCase()
  return `diff-status diff-status-${['a', 'm', 'd', 'r'].includes(letter) ? letter : 'm'}`
}

function lineClass(line: string): string {
  if (line.startsWith('@@')) return 'diff-line diff-line-hunk'
  if (line.startsWith('+++') || line.startsWith('---')) return 'diff-line diff-line-meta'
  if (line.startsWith('+')) return 'diff-line diff-line-add'
  if (line.startsWith('-')) return 'diff-line diff-line-del'
  if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('new ')) {
    return 'diff-line diff-line-meta'
  }
  return 'diff-line'
}

function listFiles(source: DiffSource): ReturnType<typeof window.gitdesktop.getCommitFiles> {
  return source.kind === 'commit'
    ? window.gitdesktop.getCommitFiles(source.repoPath, source.hash)
    : window.gitdesktop.getRangeFiles(source.repoPath, source.base, source.head)
}

function readDiff(source: DiffSource, filePath: string): ReturnType<typeof window.gitdesktop.getCommitDiff> {
  return source.kind === 'commit'
    ? window.gitdesktop.getCommitDiff(source.repoPath, source.hash, filePath)
    : window.gitdesktop.getRangeDiff(source.repoPath, source.base, source.head, filePath)
}

/**
 * Side panel that lists the files a commit or branch touched and shows the
 * git diff of the file the user clicks.
 */
export default function DiffDrawer({ source, onClose, width }: Props): JSX.Element {
  const [files, setFiles] = useState<FileChange[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [diff, setDiff] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const key = sourceKey(source)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    setFiles([])
    setSelectedFile('')
    setDiff('')
    listFiles(source).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (result.ok) {
        setFiles(result.data)
        setSelectedFile(result.data[0]?.path ?? '')
      } else {
        setLoadError(result.error)
      }
    })
    return () => {
      cancelled = true
    }
    // The source object is rebuilt on every render, so depend on its identity key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (!selectedFile) {
      setDiff('')
      return
    }
    let cancelled = false
    readDiff(source, selectedFile).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setDiff(result.data)
        setLoadError('')
      } else {
        setDiff('')
        setLoadError(result.error)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, selectedFile])

  const lines = diff.trim().length > 0 ? diff.split('\n') : []

  return (
    <aside className="diff-drawer" style={{ width }}>
      <div className="diff-drawer-header">
        <div className="diff-drawer-title">
          <strong title={source.title}>{source.title}</strong>
          <span className="diff-drawer-subtitle">{source.subtitle}</span>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close diff panel" title="Close">
          ✕
        </button>
      </div>

      {loading && <p className="placeholder">Loading changed files...</p>}
      {loadError && <div className="error-banner">{loadError}</div>}

      <ul className="diff-file-list">
        {files.map((file) => (
          <li
            key={file.path}
            className={file.path === selectedFile ? 'selected' : ''}
            {...clickable(() => setSelectedFile(file.path))}
            title={file.oldPath ? `${file.oldPath} -> ${file.path}` : file.path}
          >
            <span className={statusClass(file.status)}>{file.status}</span>
            <span className="diff-file-path">{file.path}</span>
          </li>
        ))}
        {!loading && files.length === 0 && !loadError && (
          <li className="placeholder">No file changes here.</li>
        )}
      </ul>

      <div className="diff-body">
        {selectedFile && diff.trim().length === 0 && (
          <p className="placeholder">No text diff for this file. It may be binary or a pure rename.</p>
        )}
        {lines.map((line, index) => (
          <div key={index} className={lineClass(line)}>
            {line || ' '}
          </div>
        ))}
      </div>
    </aside>
  )
}
