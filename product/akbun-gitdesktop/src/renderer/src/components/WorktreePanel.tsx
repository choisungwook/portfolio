import { useState, type JSX } from 'react'
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
      onError('Enter the branch name to create the worktree with.')
      return
    }
    const picked = await window.gitdesktop.selectDirectory('Select a folder for the new worktree')
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
    if (!window.confirm(`Remove this worktree?\n${worktree.path}`)) return
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
        {worktrees.map((worktree) => {
          const isSelected = selectedWorktree?.path === worktree.path
          return (
          <li
            key={worktree.path}
            className={isSelected ? 'selected' : ''}
            onClick={() => onSelect(worktree)}
            title={worktree.path}
          >
            <div className="worktree-info">
              <span className="worktree-branch">
                {worktree.branch}
                {worktree.isMain && <em className="badge">main</em>}
                {isSelected && <em className="badge badge-selected">selected</em>}
              </span>
              <span className="worktree-path">{worktree.path}</span>
            </div>
            <div className="worktree-actions" onClick={(event) => event.stopPropagation()}>
              <select
                defaultValue=""
                title="Open with"
                aria-label={`Open the ${worktree.branch} worktree with an app`}
                onChange={(event) => {
                  if (event.target.value) {
                    openWith(worktree, event.target.value)
                    event.target.value = ''
                  }
                }}
              >
                <option value="" disabled>
                  Open with
                </option>
                {openerApps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.label}
                  </option>
                ))}
              </select>
              {!worktree.isMain && (
                <button
                  className="icon-button"
                  title="Remove worktree"
                  aria-label={`Remove the ${worktree.branch} worktree`}
                  onClick={() => removeWorktree(worktree)}
                >
                  ✕
                </button>
              )}
            </div>
          </li>
          )
        })}
      </ul>
      <div className="worktree-add">
        <input
          type="text"
          placeholder="New branch name"
          value={newBranchName}
          onChange={(event) => setNewBranchName(event.target.value)}
        />
        <button className="primary" onClick={addWorktree}>
          + Worktree
        </button>
      </div>
    </aside>
  )
}
