import type { JSX } from 'react'
import type { RepoEntry } from '../../../shared/types'

interface Props {
  repos: RepoEntry[]
  selectedRepo: RepoEntry | null
  onSelect: (repo: RepoEntry) => void
  onImport: () => void
  onRemove: (repo: RepoEntry) => void
}

export default function RepoSidebar({ repos, selectedRepo, onSelect, onImport, onRemove }: Props): JSX.Element {
  return (
    <aside className="repo-sidebar">
      <div className="panel-header">
        <span>Repositories</span>
        <button className="primary" onClick={onImport} title="Import a git folder">
          + Import
        </button>
      </div>
      <ul className="repo-list">
        {repos.map((repo) => (
          <li
            key={repo.path}
            className={selectedRepo?.path === repo.path ? 'selected' : ''}
            onClick={() => onSelect(repo)}
            title={repo.path}
          >
            <span className="repo-name">{repo.name}</span>
            <button
              className="icon-button"
              title="Remove from the list"
              aria-label={`Remove ${repo.name} from the list`}
              onClick={(event) => {
                event.stopPropagation()
                onRemove(repo)
              }}
            >
              ✕
            </button>
          </li>
        ))}
        {repos.length === 0 && <li className="placeholder">No repositories imported yet.</li>}
      </ul>
    </aside>
  )
}
