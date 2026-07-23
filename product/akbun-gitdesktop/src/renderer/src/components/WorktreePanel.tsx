import { useState } from 'react'
import type { OpenerApp, RepoEntry, WorktreeInfo } from '../../../shared/types'

interface Props {
  repo: RepoEntry
  worktrees: WorktreeInfo[]
  selectedWorktree: WorktreeInfo | null
  openerApps: OpenerApp[]
  onSelect: (worktree: WorktreeInfo) => void
  onChanged: () => void
  onError: (message: string) => void
}

export default function WorktreePanel({
  repo,
  worktrees,
  selectedWorktree,
  openerApps,
  onSelect,
  onChanged,
  onError
}: Props): JSX.Element {
  const [newBranchName, setNewBranchName] = useState('')

  const openWith = async (worktree: WorktreeInfo, appId: string): Promise<void> => {
    const result = await window.gitdesktop.openInApp(worktree.path, appId)
    if (!result.ok) onError(result.error)
  }

  const addWorktree = async (): Promise<void> => {
    if (!newBranchName.trim()) {
      onError('worktree로 만들 브랜치 이름을 입력하세요.')
      return
    }
    const picked = await window.gitdesktop.selectDirectory('worktree를 만들 폴더 선택')
    if (!picked.ok || !picked.data) return
    const result = await window.gitdesktop.createWorktree(repo.path, picked.data, newBranchName.trim(), true)
    if (result.ok) {
      setNewBranchName('')
      onChanged()
    } else {
      onError(result.error)
    }
  }

  const removeWorktree = async (worktree: WorktreeInfo): Promise<void> => {
    if (!window.confirm(`worktree를 삭제할까요?\n${worktree.path}`)) return
    const result = await window.gitdesktop.removeWorktree(repo.path, worktree.path, false)
    if (result.ok) {
      onChanged()
    } else {
      onError(result.error)
    }
  }

  return (
    <aside className="worktree-panel">
      <div className="panel-header">
        <span>Worktree</span>
      </div>
      <ul className="worktree-list">
        {worktrees.map((worktree) => (
          <li
            key={worktree.path}
            className={selectedWorktree?.path === worktree.path ? 'selected' : ''}
            onClick={() => onSelect(worktree)}
            title={worktree.path}
          >
            <div className="worktree-info">
              <span className="worktree-branch">
                {worktree.branch}
                {worktree.isMain && <em className="badge">main</em>}
              </span>
              <span className="worktree-path">{worktree.path}</span>
            </div>
            <div className="worktree-actions" onClick={(event) => event.stopPropagation()}>
              <select
                defaultValue=""
                title="다음으로 열기"
                onChange={(event) => {
                  if (event.target.value) {
                    openWith(worktree, event.target.value)
                    event.target.value = ''
                  }
                }}
              >
                <option value="" disabled>
                  다음으로 열기
                </option>
                {openerApps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.label}
                  </option>
                ))}
              </select>
              {!worktree.isMain && (
                <button className="icon-button" title="worktree 삭제" onClick={() => removeWorktree(worktree)}>
                  ✕
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="worktree-add">
        <input
          type="text"
          placeholder="새 브랜치 이름"
          value={newBranchName}
          onChange={(event) => setNewBranchName(event.target.value)}
        />
        <button className="primary" onClick={addWorktree}>
          + worktree
        </button>
      </div>
    </aside>
  )
}
