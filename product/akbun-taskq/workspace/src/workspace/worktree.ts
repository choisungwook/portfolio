import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import type { Config } from '../config.ts'

// A task that writes to a git repository works in its own worktree, the way Claude Desktop gives each session one:
// TASKQ_HOME/worktrees/<repo>-<task> on branch taskq/<task>, started from the repository's HEAD. The task's `repo` then
// points at the worktree, so the worker, the gate and the security review work there without knowing about worktrees;
// `source_repo` keeps the repository the user picked. A read-only task and a plain folder get no worktree.

export interface Worktree {
  path: string
  branch: string
  base: string          // commit the branch started from
  base_branch: string   // the source repository's branch at that time, the target of a pull request
}

export interface PathInfo {
  exists: boolean
  git: boolean
  top?: string          // repository root
  branch?: string
  remote?: string       // origin URL
}

const GIT_TIMEOUT_MS = 20_000

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: GIT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function tryGit(cwd: string, args: string[]): string | undefined {
  try {
    return git(cwd, args)
  } catch {
    return undefined
  }
}

export function pathInfo(path: string): PathInfo {
  if (!isAbsolute(path) || !existsSync(path) || !statSync(path).isDirectory()) return { exists: false, git: false }
  const top = tryGit(path, ['rev-parse', '--show-toplevel'])
  if (!top) return { exists: true, git: false }
  return { exists: true, git: true, top, branch: tryGit(top, ['rev-parse', '--abbrev-ref', 'HEAD']), remote: tryGit(top, ['remote', 'get-url', 'origin']) }
}

export function worktreesDir(config: Config): string {
  return join(config.home, 'worktrees')
}

export function createWorktree(config: Config, repo: string, taskId: string): Worktree {
  const info = pathInfo(repo)
  if (!info.git || !info.top) throw new Error(`${repo} is not a git repository`)
  const base = tryGit(info.top, ['rev-parse', 'HEAD'])
  if (!base) throw new Error(`${repo} has no commit to start a worktree from`)
  mkdirSync(worktreesDir(config), { recursive: true })
  const path = join(worktreesDir(config), `${basename(info.top)}-${taskId}`)
  const branch = `taskq/${taskId}`
  git(info.top, ['worktree', 'add', '-b', branch, path, base])
  return { path, branch, base, base_branch: info.branch && info.branch !== 'HEAD' ? info.branch : 'main' }
}

export function removeWorktree(sourceRepo: string, worktree: Worktree): void {
  git(sourceRepo, ['worktree', 'remove', '--force', worktree.path])
}

export interface ChangedFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'untracked' | 'renamed'
  additions: number | null
  deletions: number | null
}

// Everything that differs from the base: commits on the branch and uncommitted edits, plus new untracked files.
export function changedFiles(worktree: Worktree): ChangedFile[] {
  if (!existsSync(worktree.path)) return []
  const status = new Map<string, ChangedFile['status']>()
  for (const line of (tryGit(worktree.path, ['diff', '--name-status', worktree.base]) ?? '').split('\n').filter(Boolean)) {
    const [code, ...rest] = line.split('\t')
    const file = rest.at(-1)!
    status.set(file, code.startsWith('A') ? 'added' : code.startsWith('D') ? 'deleted' : code.startsWith('R') ? 'renamed' : 'modified')
  }
  const files: ChangedFile[] = []
  for (const line of (tryGit(worktree.path, ['diff', '--numstat', worktree.base]) ?? '').split('\n').filter(Boolean)) {
    const [add, del, ...rest] = line.split('\t')
    const file = rest.join('\t').replace(/^.*\{.* => (.*)\}.*$/, '$1')
    files.push({ path: file, status: status.get(file) ?? 'modified', additions: add === '-' ? null : Number(add), deletions: del === '-' ? null : Number(del) })
  }
  for (const file of (tryGit(worktree.path, ['ls-files', '--others', '--exclude-standard']) ?? '').split('\n').filter(Boolean)) {
    files.push({ path: file, status: 'untracked', additions: null, deletions: null })
  }
  return files
}

export function fileDiff(worktree: Worktree, file: string): string {
  const known = changedFiles(worktree).find((f) => f.path === file)
  if (!known) throw new Error('that file has no change in this worktree')
  if (known.status === 'untracked') {
    const res = spawnSync('git', ['-C', worktree.path, 'diff', '--no-index', '--', '/dev/null', file], { encoding: 'utf8', timeout: GIT_TIMEOUT_MS })
    return res.stdout
  }
  return git(worktree.path, ['diff', worktree.base, '--', file])
}

export function commitsAhead(worktree: Worktree): number {
  return Number(tryGit(worktree.path, ['rev-list', '--count', `${worktree.base}..HEAD`]) ?? 0)
}

// https://github.com/<owner>/<repo> for an origin on GitHub (https or ssh form), else undefined.
export function githubRepoUrl(remote: string | undefined): string | undefined {
  if (!remote) return undefined
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remote)
  return match ? `https://github.com/${match[1]}/${match[2]}` : undefined
}

export function compareUrl(remote: string | undefined, worktree: Worktree): string | undefined {
  const repo = githubRepoUrl(remote)
  return repo ? `${repo}/compare/${encodeURIComponent(worktree.base_branch)}...${encodeURIComponent(worktree.branch)}?expand=1` : undefined
}

// A pull request URL of that repository found in text (a run summary, a bot message).
export function findPrUrl(remote: string | undefined, texts: string[]): string | undefined {
  const repo = githubRepoUrl(remote)
  if (!repo) return undefined
  const pattern = new RegExp(`${repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/pull/\\d+`, 'g')
  for (const text of texts) {
    const found = text.match(pattern)
    if (found) return found.at(-1)
  }
  return undefined
}

// Opening a folder in VS Code from the browser: the vscode:// URL works wherever VS Code is installed.
export function vscodeUrl(path: string): string {
  return `vscode://file${path.startsWith('/') ? '' : '/'}${path.replaceAll('\\', '/')}`
}
