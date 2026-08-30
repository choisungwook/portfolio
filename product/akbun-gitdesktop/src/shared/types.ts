export interface RepoEntry {
  path: string
  name: string
}

export interface RepoSizeInfo {
  path: string
  bytes: number | null
}

export interface CommitInfo {
  hash: string
  parents: string[]
  author: string
  date: string
  refs: string[]
  subject: string
}

export interface BranchInfo {
  name: string
  shortHash: string
  upstream: string
  isCurrent: boolean
  isRemote: boolean
}

export interface BranchDeletionFailure {
  name: string
  error: string
}

export interface BranchDeletionResult {
  deleted: string[]
  failed: BranchDeletionFailure[]
}

export interface WorktreeInfo {
  path: string
  head: string
  branch: string
  isMain: boolean
  isLocked: boolean
}

export interface PullRequestInfo {
  number: number
  title: string
  state: string
  author: string
  headRefName: string
  url: string
  updatedAt: string
  labels: string[]
}

export interface IssueInfo {
  number: number
  title: string
  state: string
  author: string
  url: string
  updatedAt: string
  labels: string[]
  /** Number of the issue this one is a sub-issue of. 0 when it has no parent. */
  parent: number
}

export interface ThreadComment {
  author: string
  createdAt: string
  body: string
}

/**
 * One issue or pull request with its body and comments.
 * The two are one type because GitHub numbers them in one sequence and the app
 * shows them in one drawer. The branch and diff size fields stay empty for issues.
 */
export interface ThreadDetail {
  kind: 'issue' | 'pr'
  number: number
  title: string
  state: string
  author: string
  url: string
  createdAt: string
  updatedAt: string
  labels: string[]
  assignees: string[]
  body: string
  comments: ThreadComment[]
  baseRefName: string
  headRefName: string
  additions: number
  deletions: number
  changedFiles: number
}

export interface ProjectInfo {
  number: number
  title: string
  url: string
  closed: boolean
  itemCount: number
}

/** Projects belong to an owner, not to a repository, so the owner comes with the list. */
export interface ProjectListResult {
  owner: string
  nameWithOwner: string
  projects: ProjectInfo[]
}

export interface ProjectItem {
  id: string
  title: string
  status: string
  /** Issue, PullRequest or DraftIssue. */
  type: string
  url: string
  /** 0 for a draft issue, which has no issue number. */
  number: number
  /** owner/name of the repository the item lives in. Empty for a draft issue. */
  repository: string
  assignees: string[]
  labels: string[]
}

export interface ProjectColumn {
  name: string
  items: ProjectItem[]
}

export interface ProjectBoard {
  columns: ProjectColumn[]
}

export interface OpenerApp {
  id: string
  label: string
}

/** One CLI the app depends on, as detected on the current machine. */
export interface CliToolStatus {
  id: 'git' | 'gh'
  label: string
  required: boolean
  available: boolean
  version: string
  path: string
  /** gh only. Empty when the tool is not gh or is missing. */
  authStatus: string
  authenticated: boolean
}

export interface CliStatus {
  git: CliToolStatus
  gh: CliToolStatus
}

export type ThemePreference = 'system' | 'light' | 'dark'

export interface AppSettings {
  theme: ThemePreference
  forceRemoveWorktree: boolean
}

/** A single file touched by a commit or by a diff range. */
export interface FileChange {
  path: string
  /** git name-status letter: A, M, D, R, C, T. */
  status: string
  oldPath: string
}

export type GitResult<T> = { ok: true; data: T } | { ok: false; error: string }
