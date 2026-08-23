import type {
  BranchInfo,
  CliStatus,
  CliToolStatus,
  CommitInfo,
  FileChange,
  WorktreeInfo
} from '../shared/types'
import { probeCli, runCli } from './cli'

const FIELD_SEP = '\x1f'
const MAX_LOG_COUNT = 500
const DEFAULT_BRANCH_CANDIDATES = ['main', 'master', 'develop']

export function runGit(cwd: string, args: string[]): Promise<string> {
  return runCli(cwd, 'git', args)
}

async function inspectGit(): Promise<CliToolStatus> {
  const version = await probeCli('git', ['--version'])
  return {
    id: 'git',
    label: 'git CLI',
    required: true,
    available: version.ok,
    version: version.ok ? version.output.split('\n')[0] : '',
    path: version.path,
    authStatus: '',
    authenticated: false
  }
}

async function inspectGh(): Promise<CliToolStatus> {
  const version = await probeCli('gh', ['--version'])
  const auth = version.ok
    ? await probeCli('gh', ['auth', 'status'])
    : { ok: false, output: '', path: '' }
  return {
    id: 'gh',
    label: 'gh CLI',
    required: false,
    available: version.ok,
    version: version.ok ? version.output.split('\n')[0] : '',
    path: version.path,
    authStatus: auth.output,
    authenticated: auth.ok
  }
}

/**
 * Detects the CLIs this app runs.
 * git is required by every feature, gh is only needed for the pull request list.
 */
export async function checkCliTools(): Promise<CliStatus> {
  const [git, gh] = await Promise.all([inspectGit(), inspectGh()])
  return { git, gh }
}

export async function isGitRepository(path: string): Promise<boolean> {
  try {
    const out = await runGit(path, ['rev-parse', '--is-inside-work-tree'])
    return out.trim() === 'true'
  } catch {
    return false
  }
}

export async function getGitDirectoryPath(repoPath: string): Promise<string> {
  return (await runGit(repoPath, ['rev-parse', '--absolute-git-dir'])).trim()
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

/**
 * Guesses the branch a feature branch is compared against.
 * Prefers the remote HEAD, then the usual long lived branch names.
 */
export async function getDefaultBranch(repoPath: string): Promise<string> {
  try {
    const out = await runGit(repoPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
    if (out.trim()) return out.trim()
  } catch {
    // The remote HEAD is not set in every clone, so fall through to the name list.
  }
  for (const candidate of DEFAULT_BRANCH_CANDIDATES) {
    // The local branch may be gone while the remote one still exists, so check both.
    const refs = [
      { ref: `refs/heads/${candidate}`, name: candidate },
      { ref: `refs/remotes/origin/${candidate}`, name: `origin/${candidate}` }
    ]
    for (const { ref, name } of refs) {
      const found = await probeCli('git', ['-C', repoPath, 'rev-parse', '--verify', '--quiet', ref])
      if (found.ok) return name
    }
  }
  return 'HEAD'
}

function parseNameStatus(out: string): FileChange[] {
  return out
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const fields = line.split('\t')
      const status = fields[0]
      // Renames and copies carry both the old and the new path.
      const renamed = status.startsWith('R') || status.startsWith('C')
      return {
        status,
        path: renamed ? fields[2] : fields[1],
        oldPath: renamed ? fields[1] : ''
      }
    })
    .filter((change) => Boolean(change.path))
}

/** Lists the files a single commit changed, compared with its first parent. */
export async function getCommitFiles(repoPath: string, hash: string): Promise<FileChange[]> {
  const out = await runGit(repoPath, [
    'show',
    '--first-parent',
    '--name-status',
    '--format=',
    '--no-color',
    hash
  ])
  return parseNameStatus(out)
}

export async function getCommitDiff(repoPath: string, hash: string, filePath: string): Promise<string> {
  return runGit(repoPath, ['show', '--first-parent', '--format=', '--no-color', hash, '--', filePath])
}

/** Lists the files a branch changed since it forked off the base branch. */
export async function getRangeFiles(repoPath: string, base: string, head: string): Promise<FileChange[]> {
  const out = await runGit(repoPath, ['diff', '--name-status', '--no-color', `${base}...${head}`])
  return parseNameStatus(out)
}

export async function getRangeDiff(
  repoPath: string,
  base: string,
  head: string,
  filePath: string
): Promise<string> {
  return runGit(repoPath, ['diff', '--no-color', `${base}...${head}`, '--', filePath])
}
