import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type MouseEvent
} from 'react'
import type { BranchDeletionFailure, BranchInfo } from '../../../shared/types'
import {
  clampMenuCoordinate,
  nextBranchFocusIndex,
  selectBranchNames,
  type BranchFocusMove,
  type BranchSelectionMode
} from '../lib/branchSelection'

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

interface FocusedBranches {
  local: string
  remote: string
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
  const [focusedBranches, setFocusedBranches] = useState<FocusedBranches>({ local: '', remote: '' })
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null)
  const [newBranchName, setNewBranchName] = useState('')
  const [startPoint, setStartPoint] = useState('')
  const branchElements = useRef(new Map<string, HTMLLIElement>())

  const refresh = useCallback(async () => {
    const result = await window.gitdesktop.getBranches(repoPath)
    if (result.ok) {
      const available = new Set(result.data.map((branch) => branch.name))
      const localNames = result.data.filter((branch) => !branch.isRemote).map((branch) => branch.name)
      const remoteNames = result.data.filter((branch) => branch.isRemote).map((branch) => branch.name)
      setBranches(result.data)
      setSelectedNames((current) => current.filter((name) => available.has(name)))
      setFocusedBranches((current) => ({
        local: localNames.includes(current.local) ? current.local : (localNames[0] ?? ''),
        remote: remoteNames.includes(current.remote) ? current.remote : (remoteNames[0] ?? '')
      }))
    } else {
      onError(result.error)
    }
  }, [repoPath, onError])

  useEffect(() => {
    setSelectedNames([])
    setAnchor(null)
    setFocusedBranches({ local: '', remote: '' })
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
    if (!window.confirm(
      `Force delete ${branchLabel(names.length)}?\n\n${names.join('\n')}` +
      `\n\nCommits not merged into another branch may be lost.${excludedDetail}`
    )) return

    const deletion = await window.gitdesktop.deleteBranches(repoPath, names)
    if (!deletion.ok) {
      onError(deletion.error)
      return
    }

    const deleted = deletion.data.deleted
    const failures = deletion.data.failed

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
      left: clampMenuCoordinate(event.clientX, window.innerWidth, 240),
      top: clampMenuCoordinate(event.clientY, window.innerHeight, 64)
    })
  }

  const moveBranchFocus = (
    event: KeyboardEvent<HTMLLIElement>,
    group: 'local' | 'remote',
    groupBranches: BranchInfo[]
  ): boolean => {
    const moves: Partial<Record<string, BranchFocusMove>> = {
      ArrowUp: 'previous',
      ArrowDown: 'next',
      Home: 'first',
      End: 'last'
    }
    const move = moves[event.key]
    if (!move) return false

    event.preventDefault()
    const currentIndex = groupBranches.findIndex((branch) => branch.name === focusedBranches[group])
    const nextIndex = nextBranchFocusIndex(groupBranches.length, currentIndex, move)
    const nextName = groupBranches[nextIndex]?.name
    if (!nextName) return true

    setFocusedBranches((current) => ({ ...current, [group]: nextName }))
    branchElements.current.get(`${group}:${nextName}`)?.focus()
    return true
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
        ref={(element) => {
          const key = `${group}:${branch.name}`
          if (element) branchElements.current.set(key, element)
          else branchElements.current.delete(key)
        }}
        className={className}
        role="option"
        tabIndex={focusedBranches[group] === branch.name ? 0 : -1}
        aria-selected={isSelected}
        title={`Show files changed on ${branch.name}`}
        onClick={(event) => selectBranch(branch, group, groupBranches, event)}
        onContextMenu={(event) => openContextMenu(event, branch, group)}
        onFocus={() => setFocusedBranches((current) => ({ ...current, [group]: branch.name }))}
        onKeyDown={(event) => {
          if (moveBranchFocus(event, group, groupBranches)) return
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
