export interface RepoEntry {
  path: string
  name: string
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
}

/** A single file touched by a commit or by a diff range. */
export interface FileChange {
  path: string
  /** git name-status letter: A, M, D, R, C, T. */
  status: string
  oldPath: string
}

export type GitResult<T> = { ok: true; data: T } | { ok: false; error: string }
