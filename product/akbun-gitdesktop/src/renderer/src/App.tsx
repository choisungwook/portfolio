import { useCallback, useEffect, useState, type JSX } from 'react'
import type { BranchInfo, CommitInfo, OpenerApp, RepoEntry, WorktreeInfo } from '../../shared/types'
import BranchPanel from './components/BranchPanel'
import DiffDrawer, { type DiffSource } from './components/DiffDrawer'
import GraphView from './components/GraphView'
import PrPanel from './components/PrPanel'
import RepoSidebar from './components/RepoSidebar'
import SettingsDialog from './components/SettingsDialog'
import TopBar from './components/TopBar'
import WorktreePanel from './components/WorktreePanel'
import { useCliStatus } from './lib/useCliStatus'
import { useTheme } from './lib/useTheme'

type Tab = 'graph' | 'branches' | 'prs'

export default function App(): JSX.Element {
  const [repos, setRepos] = useState<RepoEntry[]>([])
  const [selectedRepo, setSelectedRepo] = useState<RepoEntry | null>(null)
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([])
  const [selectedWorktree, setSelectedWorktree] = useState<WorktreeInfo | null>(null)
  const [openerApps, setOpenerApps] = useState<OpenerApp[]>([])
  const [tab, setTab] = useState<Tab>('graph')
  const [error, setError] = useState<string>('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [defaultBranch, setDefaultBranch] = useState('HEAD')
  const [diffSource, setDiffSource] = useState<DiffSource | null>(null)
  const theme = useTheme()
  const cli = useCliStatus()

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
      setDiffSource(null)
      refreshWorktrees(repo)
      window.gitdesktop.getDefaultBranch(repo.path).then((result) => {
        setDefaultBranch(result.ok ? result.data : 'HEAD')
      })
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
          setDiffSource(null)
        }
      } else {
        setError(result.error)
      }
    },
    [selectedRepo]
  )

  const targetPath = selectedWorktree?.path ?? selectedRepo?.path ?? ''

  const showCommitDiff = useCallback(
    (commit: CommitInfo) => {
      setDiffSource({
        kind: 'commit',
        repoPath: targetPath,
        hash: commit.hash,
        title: commit.subject,
        subtitle: `commit ${commit.hash.slice(0, 7)}`
      })
    },
    [targetPath]
  )

  const showBranchDiff = useCallback(
    (branch: BranchInfo) => {
      setDiffSource({
        kind: 'range',
        repoPath: targetPath,
        base: defaultBranch,
        head: branch.name,
        title: branch.name,
        subtitle: `git diff ${defaultBranch}...${branch.name}`
      })
    },
    [targetPath, defaultBranch]
  )

  const selectWorktree = useCallback((worktree: WorktreeInfo) => {
    setSelectedWorktree(worktree)
    setDiffSource(null)
  }, [])

  const selectTab = useCallback((next: Tab) => {
    setTab(next)
    setDiffSource(null)
  }, [])

  const selectedHash = diffSource?.kind === 'commit' ? diffSource.hash : ''
  const selectedBranch = diffSource?.kind === 'range' ? diffSource.head : ''

  return (
    <div className="app-shell">
      <TopBar status={cli.status} onOpenSettings={() => setSettingsOpen(true)} />
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
              onSelect={selectWorktree}
              onChanged={() => refreshWorktrees(selectedRepo)}
              onError={setError}
            />
            <main className="main-view">
              <nav className="tabs">
                <button className={tab === 'graph' ? 'active' : ''} onClick={() => selectTab('graph')}>
                  Graph
                </button>
                <button className={tab === 'branches' ? 'active' : ''} onClick={() => selectTab('branches')}>
                  Branches
                </button>
                <button className={tab === 'prs' ? 'active' : ''} onClick={() => selectTab('prs')}>
                  Pull requests
                </button>
                <span className="target-path">{targetPath}</span>
              </nav>
              {error && <div className="error-banner">{error}</div>}
              <div className="view-body">
                <div className="view-content">
                  {tab === 'graph' && targetPath && (
                    <GraphView
                      repoPath={targetPath}
                      selectedHash={selectedHash}
                      onSelectCommit={showCommitDiff}
                    />
                  )}
                  {tab === 'branches' && targetPath && (
                    <BranchPanel
                      repoPath={targetPath}
                      selectedBranch={selectedBranch}
                      onError={setError}
                      onSelectBranch={showBranchDiff}
                    />
                  )}
                  {tab === 'prs' && targetPath && <PrPanel repoPath={targetPath} />}
                </div>
                {diffSource && tab !== 'prs' && (
                  <DiffDrawer source={diffSource} onClose={() => setDiffSource(null)} />
                )}
              </div>
            </main>
          </>
        ) : (
          <main className="main-view empty-state">
            <p>Select a git repository on the left, or import a folder.</p>
            {error && <div className="error-banner">{error}</div>}
          </main>
        )}
      </div>
      {settingsOpen && (
        <SettingsDialog
          theme={theme.preference}
          resolvedTheme={theme.resolved}
          onThemeChange={theme.setPreference}
          status={cli.status}
          checking={cli.checking}
          onRecheck={cli.recheck}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
