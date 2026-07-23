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
        <span>저장소</span>
        <button className="primary" onClick={onImport} title="git 폴더 가져오기">
          + 가져오기
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
              title="목록에서 제거"
              onClick={(event) => {
                event.stopPropagation()
                onRemove(repo)
              }}
            >
              ✕
            </button>
          </li>
        ))}
        {repos.length === 0 && <li className="placeholder">가져온 저장소가 없습니다.</li>}
      </ul>
    </aside>
  )
}
