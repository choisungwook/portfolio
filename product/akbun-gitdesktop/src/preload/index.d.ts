import type {
  AppSettings,
  BranchDeletionResult,
  BranchInfo,
  CliStatus,
  CommitInfo,
  FileChange,
  GitResult,
  IssueInfo,
  OpenerApp,
  ProjectBoard,
  ProjectListResult,
  PullRequestInfo,
  RepoEntry,
  RepoSizeInfo,
  ThemePreference,
  ThreadDetail,
  WorktreeInfo
} from '../shared/types'

export interface GitDesktopApi {
  checkCliTools: () => Promise<GitResult<CliStatus>>
  getSettings: () => Promise<GitResult<AppSettings>>
  setTheme: (theme: ThemePreference) => Promise<GitResult<AppSettings>>
  setForceRemoveWorktree: (enabled: boolean) => Promise<GitResult<AppSettings>>
  checkForUpdates: () => Promise<void>

  listRepos: () => Promise<GitResult<RepoEntry[]>>
  getRepoSizes: () => Promise<GitResult<RepoSizeInfo[]>>
  importRepo: () => Promise<GitResult<RepoEntry[]>>
  removeRepo: (repoPath: string) => Promise<GitResult<RepoEntry[]>>

  getLog: (repoPath: string) => Promise<GitResult<CommitInfo[]>>
  getBranches: (repoPath: string) => Promise<GitResult<BranchInfo[]>>
  getWorktrees: (repoPath: string) => Promise<GitResult<WorktreeInfo[]>>
  getDefaultBranch: (repoPath: string) => Promise<GitResult<string>>

  createBranch: (repoPath: string, name: string, startPoint: string) => Promise<GitResult<void>>
  deleteBranches: (
    repoPath: string,
    names: string[],
    force: boolean
  ) => Promise<GitResult<BranchDeletionResult>>
  createWorktree: (
    repoPath: string,
    worktreePath: string,
    branch: string,
    createNewBranch: boolean
  ) => Promise<GitResult<void>>
  removeWorktree: (repoPath: string, worktreePath: string) => Promise<GitResult<boolean>>

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
  getPullRequestDetail: (repoPath: string, number: number) => Promise<GitResult<ThreadDetail>>
  getIssues: (repoPath: string) => Promise<GitResult<IssueInfo[]>>
  getIssueDetail: (repoPath: string, number: number) => Promise<GitResult<ThreadDetail>>
  getProjects: (repoPath: string) => Promise<GitResult<ProjectListResult>>
  getProjectBoard: (repoPath: string, owner: string, number: number) => Promise<GitResult<ProjectBoard>>

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
