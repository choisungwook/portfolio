import {
  useCallback,
  useEffect,
  useState,
  type JSX,
  type KeyboardEvent,
  type MouseEvent
} from 'react'
import type { BranchDeletionFailure, BranchInfo } from '../../../shared/types'
import { selectBranchNames, type BranchSelectionMode } from '../lib/branchSelection'

interface Props {
  repoPath: string
  selectedBranch: string
  onError: (message: string) => void
  onSelectBranch: (branch: BranchInfo) => void
}

interface SelectionAnchor {
  name: string
  group: 'local' | 'remote'
}

interface ContextMenuPosition {
  left: number
  top: number
}

interface SelectionModifiers {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}

function branchLabel(count: number): string {
  return `${count} local branch${count === 1 ? '' : 'es'}`
}

function failureMessage(failures: BranchDeletionFailure[]): string {
  return failures.map((failure) => `${failure.name}: ${failure.error}`).join('\n\n')
}

export default function BranchPanel({
  repoPath,
  selectedBranch,
  onError,
  onSelectBranch
}: Props): JSX.Element {
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null)
  const [newBranchName, setNewBranchName] = useState('')
  const [startPoint, setStartPoint] = useState('')

  const refresh = useCallback(async () => {
    const result = await window.gitdesktop.getBranches(repoPath)
    if (result.ok) {
      const available = new Set(result.data.map((branch) => branch.name))
      setBranches(result.data)
      setSelectedNames((current) => current.filter((name) => available.has(name)))
    } else {
      onError(result.error)
    }
  }, [repoPath, onError])

  useEffect(() => {
    setSelectedNames([])
    setAnchor(null)
    setContextMenu(null)
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!contextMenu) return
    const closeMenu = (): void => setContextMenu(null)
    window.addEventListener('click', closeMenu)
    window.addEventListener('blur', closeMenu)
    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('blur', closeMenu)
    }
  }, [contextMenu])

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

  const locals = branches.filter((branch) => !branch.isRemote)
  const remotes = branches.filter((branch) => branch.isRemote)
  const selectedBranches = selectedNames
    .map((name) => branches.find((branch) => branch.name === name))
    .filter((branch): branch is BranchInfo => Boolean(branch))
  const deletableBranches = selectedBranches.filter((branch) => !branch.isRemote && !branch.isCurrent)

  const selectBranch = (
    branch: BranchInfo,
    group: 'local' | 'remote',
    groupBranches: BranchInfo[],
    modifiers: SelectionModifiers
  ): void => {
    const toggle = modifiers.metaKey || modifiers.ctrlKey
    const sameGroupAnchor = anchor?.group === group ? anchor.name : ''
    let mode: BranchSelectionMode = 'single'
    if (modifiers.shiftKey) mode = toggle ? 'add-range' : 'range'
    else if (toggle) mode = 'toggle'

    const next = selectBranchNames(
      groupBranches.map((item) => item.name),
      selectedNames,
      sameGroupAnchor,
      branch.name,
      mode
    )
    setSelectedNames(next)

    if (!modifiers.shiftKey || !sameGroupAnchor) {
      setAnchor({ name: branch.name, group })
    }

    if (next.includes(branch.name)) {
      onSelectBranch(branch)
      return
    }

    if (selectedBranch === branch.name && next.length > 0) {
      const nextActive = branches.find((item) => item.name === next[next.length - 1])
      if (nextActive) onSelectBranch(nextActive)
    }
  }

  const deleteSelectedBranches = async (): Promise<void> => {
    if (deletableBranches.length === 0) return

    const excluded = selectedBranches.filter((branch) => branch.isRemote || branch.isCurrent)
    const excludedDetail = excluded.length > 0
      ? `\n\nExcluded from deletion:\n${excluded.map((branch) => branch.name).join('\n')}`
      : ''
    const names = deletableBranches.map((branch) => branch.name)
    if (!window.confirm(`Delete ${branchLabel(names.length)}?\n\n${names.join('\n')}${excludedDetail}`)) return

    const safelyDeleted = await window.gitdesktop.deleteBranches(repoPath, names, false)
    if (!safelyDeleted.ok) {
      onError(safelyDeleted.error)
      return
    }

    const deleted = [...safelyDeleted.data.deleted]
    const failures = [...safelyDeleted.data.failed]
    const unmerged = safelyDeleted.data.unmerged
    if (
      unmerged.length > 0 &&
      window.confirm(`Force delete ${branchLabel(unmerged.length)} not fully merged?\n\n${unmerged.join('\n')}`)
    ) {
      const forciblyDeleted = await window.gitdesktop.deleteBranches(repoPath, unmerged, true)
      if (forciblyDeleted.ok) {
        deleted.push(...forciblyDeleted.data.deleted)
        failures.push(...forciblyDeleted.data.failed)
      } else {
        failures.push(...unmerged.map((name) => ({ name, error: forciblyDeleted.error })))
      }
    }

    const deletedSet = new Set(deleted)
    const remaining = selectedNames.filter((name) => !deletedSet.has(name))
    setSelectedNames(remaining)
    setContextMenu(null)
    await refresh()

    if (deletedSet.has(selectedBranch) && remaining.length > 0) {
      const nextActive = branches.find((branch) => branch.name === remaining[remaining.length - 1])
      if (nextActive) onSelectBranch(nextActive)
    }
    if (failures.length > 0) onError(`Some branches could not be deleted.\n\n${failureMessage(failures)}`)
  }

  const openContextMenu = (
    event: MouseEvent<HTMLLIElement>,
    branch: BranchInfo,
    group: 'local' | 'remote'
  ): void => {
    event.preventDefault()
    if (!selectedNames.includes(branch.name)) {
      setSelectedNames([branch.name])
      setAnchor({ name: branch.name, group })
      onSelectBranch(branch)
    }
    setContextMenu({
      left: Math.min(event.clientX, window.innerWidth - 240),
      top: Math.min(event.clientY, window.innerHeight - 64)
    })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement
    if (target.matches('input, button')) return
    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    if (deletableBranches.length === 0) return
    event.preventDefault()
    deleteSelectedBranches()
  }

  const renderBranch = (
    branch: BranchInfo,
    group: 'local' | 'remote',
    groupBranches: BranchInfo[]
  ): JSX.Element => {
    const isSelected = selectedNames.includes(branch.name)
    const isActive = isSelected && branch.name === selectedBranch
    const className = [isSelected ? 'selected' : '', isActive ? 'active' : ''].filter(Boolean).join(' ')
    return (
      <li
        key={branch.name}
        className={className}
        role="option"
        tabIndex={0}
        aria-selected={isSelected}
        title={`Show files changed on ${branch.name}`}
        onClick={(event) => selectBranch(branch, group, groupBranches, event)}
        onContextMenu={(event) => openContextMenu(event, branch, group)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          selectBranch(branch, group, groupBranches, event)
        }}
      >
        <span className={branch.isCurrent ? 'branch-name current' : 'branch-name'}>
          {branch.isCurrent && '● '}
          {branch.name}
        </span>
        <span className="branch-hash">{branch.shortHash}</span>
        <span className="branch-upstream">{branch.upstream}</span>
      </li>
    )
  }

  return (
    <div className="branch-panel" onKeyDown={handleKeyDown}>
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
      <p className="branch-hint">
        Click for a diff. Cmd/Ctrl-click selects branches individually; Shift-click selects a range.
      </p>
      <h3>Local branches</h3>
      <ul className="branch-list" role="listbox" aria-label="Local branches" aria-multiselectable="true">
        {locals.map((branch) => renderBranch(branch, 'local', locals))}
      </ul>
      <h3>Remote branches</h3>
      <ul className="branch-list" role="listbox" aria-label="Remote branches" aria-multiselectable="true">
        {remotes.map((branch) => renderBranch(branch, 'remote', remotes))}
      </ul>
      {contextMenu && (
        <div
          className="branch-context-menu"
          role="menu"
          style={{ left: contextMenu.left, top: contextMenu.top }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            role="menuitem"
            disabled={deletableBranches.length === 0}
            onClick={deleteSelectedBranches}
          >
            Delete {branchLabel(deletableBranches.length)}…
          </button>
        </div>
      )}
    </div>
  )
}
