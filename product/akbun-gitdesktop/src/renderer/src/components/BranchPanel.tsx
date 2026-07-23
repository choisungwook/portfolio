import { useCallback, useEffect, useState, type JSX } from 'react'
import type { BranchInfo } from '../../../shared/types'

interface Props {
  repoPath: string
  onError: (message: string) => void
}

export default function BranchPanel({ repoPath, onError }: Props): JSX.Element {
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
      onError('브랜치 이름을 입력하세요.')
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
    if (!window.confirm(`브랜치를 삭제할까요?\n${branch.name}`)) return
    const result = await window.gitdesktop.deleteBranch(repoPath, branch.name, false)
    if (result.ok) {
      refresh()
      return
    }
    if (window.confirm(`병합되지 않은 브랜치입니다. 강제로 삭제할까요?\n\n${result.error}`)) {
      const forced = await window.gitdesktop.deleteBranch(repoPath, branch.name, true)
      forced.ok ? refresh() : onError(forced.error)
    }
  }

  const locals = branches.filter((branch) => !branch.isRemote)
  const remotes = branches.filter((branch) => branch.isRemote)

  return (
    <div className="branch-panel">
      <div className="branch-create">
        <input
          type="text"
          placeholder="새 브랜치 이름"
          value={newBranchName}
          onChange={(event) => setNewBranchName(event.target.value)}
        />
        <input
          type="text"
          placeholder="시작 지점 (생략 시 HEAD)"
          value={startPoint}
          onChange={(event) => setStartPoint(event.target.value)}
        />
        <button className="primary" onClick={createBranch}>
          + 브랜치 생성
        </button>
      </div>
      <h3>로컬 브랜치</h3>
      <ul className="branch-list">
        {locals.map((branch) => (
          <li key={branch.name}>
            <span className={branch.isCurrent ? 'branch-name current' : 'branch-name'}>
              {branch.isCurrent && '● '}
              {branch.name}
            </span>
            <span className="branch-hash">{branch.shortHash}</span>
            <span className="branch-upstream">{branch.upstream}</span>
            {!branch.isCurrent && (
              <button className="icon-button" title="브랜치 삭제" onClick={() => deleteBranch(branch)}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      <h3>원격 브랜치</h3>
      <ul className="branch-list">
        {remotes.map((branch) => (
          <li key={branch.name}>
            <span className="branch-name">{branch.name}</span>
            <span className="branch-hash">{branch.shortHash}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
