import { useCallback, useEffect, useState, type JSX } from 'react'
import type { ProjectBoard, ProjectInfo, ProjectItem } from '../../../shared/types'
import { clickable } from '../lib/clickable'
import { ghErrorMessage, PROJECT_SCOPE_HINT } from '../lib/github'

interface Props {
  repoPath: string
  selectedNumber: number
  onSelectThread: (kind: 'issue' | 'pr', number: number, title: string) => void
}

const EMPTY_BOARD: ProjectBoard = { columns: [] }

function itemKind(item: ProjectItem): 'issue' | 'pr' | null {
  if (item.type === 'Issue') return 'issue'
  if (item.type === 'PullRequest') return 'pr'
  return null
}

/**
 * Kanban view of the projects owned by the owner of this repository.
 * Columns come from the Status field, which is what the board on GitHub groups by.
 */
export default function ProjectPanel({ repoPath, selectedNumber, onSelectThread }: Props): JSX.Element {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [owner, setOwner] = useState('')
  const [nameWithOwner, setNameWithOwner] = useState('')
  const [selected, setSelected] = useState(0)
  const [board, setBoard] = useState<ProjectBoard>(EMPTY_BOARD)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    setBoard(EMPTY_BOARD)
    window.gitdesktop.getProjects(repoPath).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        setProjects([])
        setLoadError(ghErrorMessage('projects', result.error, PROJECT_SCOPE_HINT))
        return
      }
      setOwner(result.data.owner)
      setNameWithOwner(result.data.nameWithOwner)
      setProjects(result.data.projects)
      const open = result.data.projects.find((project) => !project.closed)
      setSelected(open?.number ?? result.data.projects[0]?.number ?? 0)
    })
    return () => {
      cancelled = true
    }
  }, [repoPath])

  const loadBoard = useCallback(async () => {
    if (!owner || !selected) return
    setLoading(true)
    const result = await window.gitdesktop.getProjectBoard(repoPath, owner, selected)
    setLoading(false)
    if (result.ok) {
      setBoard(result.data)
      setLoadError('')
    } else {
      setBoard(EMPTY_BOARD)
      setLoadError(ghErrorMessage('this project board', result.error, PROJECT_SCOPE_HINT))
    }
  }, [repoPath, owner, selected])

  useEffect(() => {
    loadBoard()
  }, [loadBoard])

  const openItem = (item: ProjectItem): void => {
    const kind = itemKind(item)
    // A card from another repository cannot be read with gh in this working copy,
    // and a draft issue has no number at all, so both fall back to the browser.
    if (kind && item.number > 0 && item.repository === nameWithOwner) {
      onSelectThread(kind, item.number, item.title)
      return
    }
    if (item.url) window.gitdesktop.openExternal(item.url)
  }

  const project = projects.find((entry) => entry.number === selected) ?? null

  return (
    <div className="project-panel">
      <div className="project-toolbar">
        <select
          value={selected}
          onChange={(event) => setSelected(Number(event.target.value))}
          aria-label="Project"
        >
          {projects.length === 0 && <option value={0}>No project</option>}
          {projects.map((entry) => (
            <option key={entry.number} value={entry.number}>
              #{entry.number} {entry.title}
              {entry.closed ? ' (closed)' : ''}
            </option>
          ))}
        </select>
        <button onClick={loadBoard} title="Reload this board">
          Refresh
        </button>
        {project && (
          <button onClick={() => window.gitdesktop.openExternal(project.url)} title="Open on GitHub">
            Open in browser
          </button>
        )}
        {owner && <span className="pr-meta">owner {owner}</span>}
      </div>

      {loadError && <div className="error-banner">{loadError}</div>}
      {loading && <p className="placeholder">Loading project...</p>}
      {!loading && !loadError && projects.length === 0 && (
        <p className="placeholder">This owner has no project.</p>
      )}

      <div className="project-board">
        {board.columns.map((column) => (
          <section className="project-column" key={column.name}>
            <h3>
              {column.name}
              <span className="project-count">{column.items.length}</span>
            </h3>
            <ul>
              {column.items.map((item) => (
                <li
                  key={item.id}
                  className={item.number === selectedNumber && item.number > 0 ? 'selected' : ''}
                  {...clickable(() => openItem(item))}
                  title={item.title}
                >
                  <span className="project-card-title">{item.title}</span>
                  <span className="project-card-meta">
                    {item.number > 0 ? `#${item.number}` : 'draft'}
                    {item.repository && item.repository !== nameWithOwner ? ` · ${item.repository}` : ''}
                    {item.assignees.length > 0 ? ` · ${item.assignees.join(', ')}` : ''}
                  </span>
                  {item.labels.length > 0 && (
                    <span className="label-row">
                      {item.labels.map((label) => (
                        <span key={label} className="label-chip">
                          {label}
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              ))}
              {column.items.length === 0 && <li className="placeholder">Empty</li>}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
