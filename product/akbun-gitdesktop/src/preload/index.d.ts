import type {
  AppSettings,
  BranchInfo,
  CliStatus,
  CommitInfo,
  FileChange,
  GitResult,
  OpenerApp,
  PullRequestInfo,
  RepoEntry,
  ThemePreference,
  WorktreeInfo
} from '../shared/types'

export interface GitDesktopApi {
  checkCliTools: () => Promise<GitResult<CliStatus>>
  getSettings: () => Promise<GitResult<AppSettings>>
  setTheme: (theme: ThemePreference) => Promise<GitResult<AppSettings>>

  listRepos: () => Promise<GitResult<RepoEntry[]>>
  importRepo: () => Promise<GitResult<RepoEntry[]>>
  removeRepo: (repoPath: string) => Promise<GitResult<RepoEntry[]>>

  getLog: (repoPath: string) => Promise<GitResult<CommitInfo[]>>
  getBranches: (repoPath: string) => Promise<GitResult<BranchInfo[]>>
  getWorktrees: (repoPath: string) => Promise<GitResult<WorktreeInfo[]>>
  getDefaultBranch: (repoPath: string) => Promise<GitResult<string>>

  createBranch: (repoPath: string, name: string, startPoint: string) => Promise<GitResult<void>>
  deleteBranch: (repoPath: string, name: string, force: boolean) => Promise<GitResult<void>>
  createWorktree: (
    repoPath: string,
    worktreePath: string,
    branch: string,
    createNewBranch: boolean
  ) => Promise<GitResult<void>>
  removeWorktree: (repoPath: string, worktreePath: string, force: boolean) => Promise<GitResult<void>>

  getCommitFiles: (repoPath: string, hash: string) => Promise<GitResult<FileChange[]>>
  getCommitDiff: (repoPath: string, hash: string, filePath: string) => Promise<GitResult<string>>
  getRangeFiles: (repoPath: string, base: string, head: string) => Promise<GitResult<FileChange[]>>
  getRangeDiff: (
    repoPath: string,
    base: string,
    head: string,
    filePath: string
  ) => Promise<GitResult<string>>

  getPullRequests: (repoPath: string) => Promise<GitResult<PullRequestInfo[]>>

  openExternal: (url: string) => Promise<GitResult<void>>
  listOpenerApps: () => Promise<GitResult<OpenerApp[]>>
  openInApp: (targetPath: string, appId: string) => Promise<GitResult<void>>
  selectDirectory: (title: string) => Promise<GitResult<string>>
}

declare global {
  interface Window {
    gitdesktop: GitDesktopApi
  }
}
