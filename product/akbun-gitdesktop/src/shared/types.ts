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

export type GitResult<T> = { ok: true; data: T } | { ok: false; error: string }
