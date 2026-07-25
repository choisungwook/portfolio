import { useCallback, useEffect, useState, type JSX } from 'react'
import type { BranchInfo } from '../../../shared/types'
import { clickable } from '../lib/clickable'

interface Props {
  repoPath: string
  selectedBranch: string
  onError: (message: string) => void
  onSelectBranch: (branch: BranchInfo) => void
}

export default function BranchPanel({
  repoPath,
  selectedBranch,
  onError,
  onSelectBranch
}: Props): JSX.Element {
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [newBranchName, setNewBranchName] = useState('')
  const [startPoint, setStartPoint] = useState('')

  const refresh = useCallback(async () => {
    const result = await window.gitdesktop.getBranches(repoPath)
    if (result.ok) {
      setBranches(result.data)
    } else {
      onError(result.error)
    }
  }, [repoPath, onError])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createBranch = async (): Promise<void> => {
    if (!newBranchName.trim()) {
      onError('Enter a branch name.')
      return
    }
    const result = await window.gitdesktop.createBranch(repoPath, newBranchName.trim(), startPoint.trim())
    if (result.ok) {
      setNewBranchName('')
      setStartPoint('')
      refresh()
    } else {
      onError(result.error)
    }
  }

  const deleteBranch = async (branch: BranchInfo): Promise<void> => {
    if (!window.confirm(`Delete this branch?\n${branch.name}`)) return
    const result = await window.gitdesktop.deleteBranch(repoPath, branch.name, false)
    if (result.ok) {
      refresh()
      return
    }
    if (window.confirm(`The branch is not fully merged. Delete it anyway?\n\n${result.error}`)) {
      const forced = await window.gitdesktop.deleteBranch(repoPath, branch.name, true)
      forced.ok ? refresh() : onError(forced.error)
    }
  }

  const locals = branches.filter((branch) => !branch.isRemote)
  const remotes = branches.filter((branch) => branch.isRemote)

  const renderBranch = (branch: BranchInfo, deletable: boolean): JSX.Element => (
    <li
      key={branch.name}
      className={branch.name === selectedBranch ? 'selected' : ''}
      {...clickable(() => onSelectBranch(branch))}
      title={`Show files changed on ${branch.name}`}
    >
      <span className={branch.isCurrent ? 'branch-name current' : 'branch-name'}>
        {branch.isCurrent && '● '}
        {branch.name}
      </span>
      <span className="branch-hash">{branch.shortHash}</span>
      <span className="branch-upstream">{branch.upstream}</span>
      {deletable && (
        <button
          className="icon-button"
          title="Delete branch"
          aria-label={`Delete branch ${branch.name}`}
          onClick={(event) => {
            event.stopPropagation()
            deleteBranch(branch)
          }}
        >
          ✕
        </button>
      )}
    </li>
  )

  return (
    <div className="branch-panel">
      <div className="branch-create">
        <input
          type="text"
          placeholder="New branch name"
          value={newBranchName}
          onChange={(event) => setNewBranchName(event.target.value)}
        />
        <input
          type="text"
          placeholder="Start point (defaults to HEAD)"
          value={startPoint}
          onChange={(event) => setStartPoint(event.target.value)}
        />
        <button className="primary" onClick={createBranch}>
          + Create branch
        </button>
      </div>
      <p className="branch-hint">Click a branch to see the files it changed, then click a file for its diff.</p>
      <h3>Local branches</h3>
      <ul className="branch-list">{locals.map((branch) => renderBranch(branch, !branch.isCurrent))}</ul>
      <h3>Remote branches</h3>
      <ul className="branch-list">{remotes.map((branch) => renderBranch(branch, false))}</ul>
    </div>
  )
}
