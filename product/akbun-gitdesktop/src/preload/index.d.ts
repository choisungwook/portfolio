import type {
  BranchInfo,
  CommitInfo,
  GitResult,
  OpenerApp,
  PullRequestInfo,
  RepoEntry,
  WorktreeInfo
} from '../shared/types'

export interface GitDesktopApi {
  listRepos: () => Promise<GitResult<RepoEntry[]>>
  importRepo: () => Promise<GitResult<RepoEntry[]>>
  removeRepo: (repoPath: string) => Promise<GitResult<RepoEntry[]>>

  getLog: (repoPath: string) => Promise<GitResult<CommitInfo[]>>
  getBranches: (repoPath: string) => Promise<GitResult<BranchInfo[]>>
  getWorktrees: (repoPath: string) => Promise<GitResult<WorktreeInfo[]>>

  createBranch: (repoPath: string, name: string, startPoint: string) => Promise<GitResult<void>>
  deleteBranch: (repoPath: string, name: string, force: boolean) => Promise<GitResult<void>>
  createWorktree: (
    repoPath: string,
    worktreePath: string,
    branch: string,
    createNewBranch: boolean
  ) => Promise<GitResult<void>>
  removeWorktree: (repoPath: string, worktreePath: string, force: boolean) => Promise<GitResult<void>>

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
