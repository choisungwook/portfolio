import { execFile } from 'node:child_process'
import type { BranchInfo, CommitInfo, PullRequestInfo, WorktreeInfo } from '../shared/types'

const FIELD_SEP = '\x1f'
const MAX_LOG_COUNT = 500

export function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
        return
      }
      resolve(stdout)
    })
  })
}

function runGh(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { cwd, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
        return
      }
      resolve(stdout)
    })
  })
}

export async function isGitRepository(path: string): Promise<boolean> {
  try {
    const out = await runGit(path, ['rev-parse', '--is-inside-work-tree'])
    return out.trim() === 'true'
  } catch {
    return false
  }
}

export async function getLog(repoPath: string): Promise<CommitInfo[]> {
  const format = ['%H', '%P', '%an', '%ad', '%D', '%s'].join(FIELD_SEP)
  const out = await runGit(repoPath, [
    'log',
    '--branches',
    '--remotes',
    '--tags',
    '--topo-order',
    `--max-count=${MAX_LOG_COUNT}`,
    '--date=format:%Y-%m-%d %H:%M',
    `--pretty=format:${format}`
  ])
  return out
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [hash, parents, author, date, refs, subject] = line.split(FIELD_SEP)
      return {
        hash,
        parents: parents ? parents.split(' ') : [],
        author,
        date,
        refs: refs ? refs.split(', ').filter(Boolean) : [],
        subject: subject ?? ''
      }
    })
}

export async function getBranches(repoPath: string): Promise<BranchInfo[]> {
  const format = ['%(refname)', '%(refname:short)', '%(objectname:short)', '%(upstream:short)', '%(HEAD)'].join(
    FIELD_SEP
  )
  const out = await runGit(repoPath, [
    'branch',
    '--all',
    '--sort=-committerdate',
    `--format=${format}`
  ])
  return out
    .split('\n')
    .filter((line) => line.length > 0 && !line.includes('HEAD detached'))
    .map((line) => {
      const [refname, name, shortHash, upstream, head] = line.split(FIELD_SEP)
      return {
        name,
        shortHash,
        upstream: upstream ?? '',
        isCurrent: head === '*',
        isRemote: refname.startsWith('refs/remotes/')
      }
    })
    .filter((branch) => !branch.name.endsWith('/HEAD'))
}

export async function getWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  const out = await runGit(repoPath, ['worktree', 'list', '--porcelain'])
  const worktrees: WorktreeInfo[] = []
  let current: Partial<WorktreeInfo> | null = null

  const flush = (): void => {
    if (current?.path) {
      worktrees.push({
        path: current.path,
        head: current.head ?? '',
        branch: current.branch ?? '(detached)',
        isMain: worktrees.length === 0,
        isLocked: current.isLocked ?? false
      })
    }
    current = null
  }

  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      flush()
      current = { path: line.slice('worktree '.length) }
    } else if (line.startsWith('HEAD ') && current) {
      current.head = line.slice('HEAD '.length, 'HEAD '.length + 7)
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.slice('branch '.length).replace('refs/heads/', '')
    } else if (line.startsWith('locked') && current) {
      current.isLocked = true
    }
  }
  flush()
  return worktrees
}

export async function createBranch(repoPath: string, name: string, startPoint: string): Promise<void> {
  const args = startPoint ? ['branch', name, startPoint] : ['branch', name]
  await runGit(repoPath, args)
}

export async function deleteBranch(repoPath: string, name: string, force: boolean): Promise<void> {
  await runGit(repoPath, ['branch', force ? '-D' : '-d', name])
}

export async function createWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string,
  createNewBranch: boolean
): Promise<void> {
  const args = createNewBranch
    ? ['worktree', 'add', '-b', branch, worktreePath]
    : ['worktree', 'add', worktreePath, branch]
  await runGit(repoPath, args)
}

export async function removeWorktree(repoPath: string, worktreePath: string, force: boolean): Promise<void> {
  const args = ['worktree', 'remove', worktreePath]
  if (force) args.push('--force')
  await runGit(repoPath, args)
}

export async function getPullRequests(repoPath: string): Promise<PullRequestInfo[]> {
  const out = await runGh(repoPath, [
    'pr',
    'list',
    '--state',
    'all',
    '--limit',
    '50',
    '--json',
    'number,title,state,author,headRefName,url,updatedAt'
  ])
  const rows = JSON.parse(out) as Array<{
    number: number
    title: string
    state: string
    author: { login: string }
    headRefName: string
    url: string
    updatedAt: string
  }>
  return rows.map((row) => ({
    number: row.number,
    title: row.title,
    state: row.state,
    author: row.author?.login ?? '',
    headRefName: row.headRefName,
    url: row.url,
    updatedAt: row.updatedAt
  }))
}
