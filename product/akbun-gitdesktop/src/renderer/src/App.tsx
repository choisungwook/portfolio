import { useCallback, useEffect, useState } from 'react'
import type { OpenerApp, RepoEntry, WorktreeInfo } from '../../shared/types'
import BranchPanel from './components/BranchPanel'
import GraphView from './components/GraphView'
import PrPanel from './components/PrPanel'
import RepoSidebar from './components/RepoSidebar'
import WorktreePanel from './components/WorktreePanel'

type Tab = 'graph' | 'branches' | 'prs'

export default function App(): JSX.Element {
  const [repos, setRepos] = useState<RepoEntry[]>([])
  const [selectedRepo, setSelectedRepo] = useState<RepoEntry | null>(null)
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([])
  const [selectedWorktree, setSelectedWorktree] = useState<WorktreeInfo | null>(null)
  const [openerApps, setOpenerApps] = useState<OpenerApp[]>([])
  const [tab, setTab] = useState<Tab>('graph')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    window.gitdesktop.listRepos().then((result) => {
      if (result.ok) setRepos(result.data)
    })
    window.gitdesktop.listOpenerApps().then((result) => {
      if (result.ok) setOpenerApps(result.data)
    })
  }, [])

  const refreshWorktrees = useCallback(async (repo: RepoEntry) => {
    const result = await window.gitdesktop.getWorktrees(repo.path)
    if (result.ok) {
      setWorktrees(result.data)
      setSelectedWorktree(result.data[0] ?? null)
      setError('')
    } else {
      setWorktrees([])
      setSelectedWorktree(null)
      setError(result.error)
    }
  }, [])

  const selectRepo = useCallback(
    (repo: RepoEntry) => {
      setSelectedRepo(repo)
      setTab('graph')
      refreshWorktrees(repo)
    },
    [refreshWorktrees]
  )

  const importRepo = useCallback(async () => {
    const result = await window.gitdesktop.importRepo()
    if (result.ok) {
      setRepos(result.data)
      setError('')
    } else {
      setError(result.error)
    }
  }, [])

  const removeRepo = useCallback(
    async (repo: RepoEntry) => {
      const result = await window.gitdesktop.removeRepo(repo.path)
      if (result.ok) {
        setRepos(result.data)
        if (selectedRepo?.path === repo.path) {
          setSelectedRepo(null)
          setWorktrees([])
          setSelectedWorktree(null)
        }
      }
    },
    [selectedRepo]
  )

  const targetPath = selectedWorktree?.path ?? selectedRepo?.path ?? ''

  return (
    <div className="app">
      <RepoSidebar
        repos={repos}
        selectedRepo={selectedRepo}
        onSelect={selectRepo}
        onImport={importRepo}
        onRemove={removeRepo}
      />
      {selectedRepo ? (
        <>
          <WorktreePanel
            repo={selectedRepo}
            worktrees={worktrees}
            selectedWorktree={selectedWorktree}
            openerApps={openerApps}
            onSelect={setSelectedWorktree}
            onChanged={() => refreshWorktrees(selectedRepo)}
            onError={setError}
          />
          <main className="main-view">
            <nav className="tabs">
              <button className={tab === 'graph' ? 'active' : ''} onClick={() => setTab('graph')}>
                그래프
              </button>
              <button className={tab === 'branches' ? 'active' : ''} onClick={() => setTab('branches')}>
                브랜치
              </button>
              <button className={tab === 'prs' ? 'active' : ''} onClick={() => setTab('prs')}>
                Pull Request
              </button>
              <span className="target-path">{targetPath}</span>
            </nav>
            {error && <div className="error-banner">{error}</div>}
            {tab === 'graph' && targetPath && <GraphView repoPath={targetPath} />}
            {tab === 'branches' && targetPath && (
              <BranchPanel repoPath={targetPath} onError={setError} />
            )}
            {tab === 'prs' && targetPath && <PrPanel repoPath={targetPath} />}
          </main>
        </>
      ) : (
        <main className="main-view empty-state">
          <p>왼쪽에서 git 저장소를 선택하거나 폴더를 가져오세요.</p>
          {error && <div className="error-banner">{error}</div>}
        </main>
      )}
    </div>
  )
}
