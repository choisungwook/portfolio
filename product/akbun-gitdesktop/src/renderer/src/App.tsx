import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { BranchInfo, CommitInfo, OpenerApp, RepoEntry, WorktreeInfo } from '../../shared/types'
import BranchPanel from './components/BranchPanel'
import DiffDrawer, { type DiffSource } from './components/DiffDrawer'
import GraphView from './components/GraphView'
import IssuePanel from './components/IssuePanel'
import { ResizeAfterPanel, ResizeBeforePanel } from './components/PanelResizer'
import PrPanel from './components/PrPanel'
import ProjectPanel from './components/ProjectPanel'
import RepoSidebar from './components/RepoSidebar'
import SettingsDialog from './components/SettingsDialog'
import ThreadDrawer, { type ThreadRef } from './components/ThreadDrawer'
import TopBar from './components/TopBar'
import WorktreePanel from './components/WorktreePanel'
import { useCliStatus } from './lib/useCliStatus'
import { usePanelWidth } from './lib/usePanelWidth'
import { useTheme } from './lib/useTheme'

type Tab = 'graph' | 'branches' | 'prs' | 'issues' | 'projects'

const TAB_LABELS: Array<[Tab, string]> = [
  ['graph', 'Graph'],
  ['branches', 'Branches'],
  ['prs', 'Pull requests'],
  ['issues', 'Issues'],
  ['projects', 'Projects']
]

const REPO_PANEL = { defaultWidth: 220, minWidth: 160, maxWidth: 420 }
const WORKTREE_PANEL = { defaultWidth: 280, minWidth: 200, maxWidth: 520 }
const DETAIL_PANEL = { defaultWidth: 560, minWidth: 320, maxWidth: 900 }

/** The git tabs show a diff on the right, the GitHub tabs show an issue or a pull request. */
function isGitTab(tab: Tab): boolean {
  return tab === 'graph' || tab === 'branches'
}

export default function App(): JSX.Element {
  const [repos, setRepos] = useState<RepoEntry[]>([])
  const [repoSizes, setRepoSizes] = useState<Record<string, number | null>>({})
  const [selectedRepo, setSelectedRepo] = useState<RepoEntry | null>(null)
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([])
  const [selectedWorktree, setSelectedWorktree] = useState<WorktreeInfo | null>(null)
  const [openerApps, setOpenerApps] = useState<OpenerApp[]>([])
  const [tab, setTab] = useState<Tab>('graph')
  const [error, setError] = useState<string>('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [forceRemoveWorktree, setForceRemoveWorktree] = useState(false)
  const [defaultBranch, setDefaultBranch] = useState('HEAD')
  const [diffSource, setDiffSource] = useState<DiffSource | null>(null)
  const [thread, setThread] = useState<ThreadRef | null>(null)
  const [repoPanelWidth, setRepoPanelWidth] = usePanelWidth(
    'panel-width:repositories',
    REPO_PANEL.defaultWidth,
    REPO_PANEL.minWidth,
    REPO_PANEL.maxWidth
  )
  const [worktreePanelWidth, setWorktreePanelWidth] = usePanelWidth(
    'panel-width:worktrees',
    WORKTREE_PANEL.defaultWidth,
    WORKTREE_PANEL.minWidth,
    WORKTREE_PANEL.maxWidth
  )
  const [detailPanelWidth, setDetailPanelWidth] = usePanelWidth(
    'panel-width:details',
    DETAIL_PANEL.defaultWidth,
    DETAIL_PANEL.minWidth,
    DETAIL_PANEL.maxWidth
  )
  const theme = useTheme()
  const cli = useCliStatus()
  // The repository whose default branch lookup is still allowed to win.
  const pendingRepoPath = useRef('')

  const refreshRepoSizes = useCallback(async () => {
    const result = await window.gitdesktop.getRepoSizes()
    if (result.ok) {
      setRepoSizes(Object.fromEntries(result.data.map((entry) => [entry.path, entry.bytes])))
    }
  }, [])

  useEffect(() => {
    window.gitdesktop.listRepos().then((result) => {
      if (result.ok) setRepos(result.data)
    })
    window.gitdesktop.listOpenerApps().then((result) => {
      if (result.ok) setOpenerApps(result.data)
    })
    window.gitdesktop.getSettings().then((result) => {
      if (result.ok) setForceRemoveWorktree(result.data.forceRemoveWorktree)
    })
    refreshRepoSizes()
  }, [refreshRepoSizes])

  const changeForceRemoveWorktree = useCallback(async (enabled: boolean) => {
    const result = await window.gitdesktop.setForceRemoveWorktree(enabled)
    if (result.ok) {
      setForceRemoveWorktree(result.data.forceRemoveWorktree)
      setError('')
    } else {
      setError(result.error)
    }
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
      setThread(null)
      refreshWorktrees(repo)
      pendingRepoPath.current = repo.path
      setDefaultBranch('HEAD')
      window.gitdesktop.getDefaultBranch(repo.path).then((result) => {
        // A newer selection may have landed while this lookup was in flight.
        if (pendingRepoPath.current !== repo.path) return
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
      refreshRepoSizes()
    } else {
      setError(result.error)
    }
  }, [refreshRepoSizes])

  const removeRepo = useCallback(
    async (repo: RepoEntry) => {
      const result = await window.gitdesktop.removeRepo(repo.path)
      if (result.ok) {
        setRepos(result.data)
        refreshRepoSizes()
        if (selectedRepo?.path === repo.path) {
          pendingRepoPath.current = ''
          setSelectedRepo(null)
          setWorktrees([])
          setSelectedWorktree(null)
          setDiffSource(null)
          setThread(null)
        }
      } else {
        setError(result.error)
      }
    },
    [refreshRepoSizes, selectedRepo]
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

  const showThread = useCallback(
    (kind: 'issue' | 'pr', number: number, title: string) => {
      setThread({ kind, repoPath: targetPath, number, title })
    },
    [targetPath]
  )

  const selectWorktree = useCallback((worktree: WorktreeInfo) => {
    setSelectedWorktree(worktree)
    setDiffSource(null)
    setThread(null)
  }, [])

  const selectTab = useCallback((next: Tab) => {
    setTab(next)
    setDiffSource(null)
    setThread(null)
  }, [])

  const selectedHash = diffSource?.kind === 'commit' ? diffSource.hash : ''
  const selectedBranch = diffSource?.kind === 'range' ? diffSource.head : ''
  const selectedThreadNumber = thread?.number ?? 0

  return (
    <div className="app-shell">
      <TopBar
        status={cli.status}
        onImportRepo={importRepo}
        onOpenSettings={() => setSettingsOpen(true)}
        onRecheckCli={cli.recheck}
        onCheckForUpdates={() => window.gitdesktop.checkForUpdates()}
      />
      <div className="app">
        <RepoSidebar
          repos={repos}
          selectedRepo={selectedRepo}
          repoSizes={repoSizes}
          width={repoPanelWidth}
          onSelect={selectRepo}
          onImport={importRepo}
          onRemove={removeRepo}
        />
        <ResizeAfterPanel
          label="Resize repository panel"
          width={repoPanelWidth}
          minWidth={REPO_PANEL.minWidth}
          maxWidth={REPO_PANEL.maxWidth}
          onChange={setRepoPanelWidth}
        />
        {selectedRepo ? (
          <>
            <WorktreePanel
              repo={selectedRepo}
              worktrees={worktrees}
              selectedWorktree={selectedWorktree}
              openerApps={openerApps}
              width={worktreePanelWidth}
              onSelect={selectWorktree}
              onChanged={() => refreshWorktrees(selectedRepo)}
              onError={setError}
            />
            <ResizeAfterPanel
              label="Resize worktree panel"
              width={worktreePanelWidth}
              minWidth={WORKTREE_PANEL.minWidth}
              maxWidth={WORKTREE_PANEL.maxWidth}
              onChange={setWorktreePanelWidth}
            />
            <main className="main-view">
              <nav className="tabs">
                {TAB_LABELS.map(([id, label]) => (
                  <button
                    key={id}
                    className={tab === id ? 'active' : ''}
                    onClick={() => selectTab(id)}
                  >
                    {label}
                  </button>
                ))}
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
                  {tab === 'prs' && targetPath && (
                    <PrPanel
                      repoPath={targetPath}
                      selectedNumber={selectedThreadNumber}
                      onSelect={(pr) => showThread('pr', pr.number, pr.title)}
                    />
                  )}
                  {tab === 'issues' && targetPath && (
                    <IssuePanel
                      repoPath={targetPath}
                      selectedNumber={selectedThreadNumber}
                      onSelect={(issue) => showThread('issue', issue.number, issue.title)}
                    />
                  )}
                  {tab === 'projects' && targetPath && (
                    <ProjectPanel
                      repoPath={targetPath}
                      selectedNumber={selectedThreadNumber}
                      onSelectThread={showThread}
                    />
                  )}
                </div>
                {isGitTab(tab) && diffSource && (
                  <>
                    <ResizeBeforePanel
                      label="Resize diff panel"
                      width={detailPanelWidth}
                      minWidth={DETAIL_PANEL.minWidth}
                      maxWidth={DETAIL_PANEL.maxWidth}
                      onChange={setDetailPanelWidth}
                    />
                    <DiffDrawer
                      source={diffSource}
                      width={detailPanelWidth}
                      onClose={() => setDiffSource(null)}
                    />
                  </>
                )}
                {!isGitTab(tab) && thread && (
                  <>
                    <ResizeBeforePanel
                      label="Resize detail panel"
                      width={detailPanelWidth}
                      minWidth={DETAIL_PANEL.minWidth}
                      maxWidth={DETAIL_PANEL.maxWidth}
                      onChange={setDetailPanelWidth}
                    />
                    <ThreadDrawer
                      thread={thread}
                      width={detailPanelWidth}
                      onClose={() => setThread(null)}
                    />
                  </>
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
          forceRemoveWorktree={forceRemoveWorktree}
          onForceRemoveWorktreeChange={changeForceRemoveWorktree}
          status={cli.status}
          checking={cli.checking}
          onRecheck={cli.recheck}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
