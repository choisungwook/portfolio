import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { Config } from '../config.ts'
import type { Task, TaskData, TaskRepo } from '../types.ts'
import { createWorktree, pathInfo, worktreeFolder, type Worktree } from './worktree.ts'

// A task's repositories (local folders, usually GitHub checkouts). The first one is the task's main workspace and is
// mirrored into data.repo / source_repo / worktree, which the worker, the gate and the reviews already read. With
// use_worktree on, each git repository gets the task's own worktree (branch taskq/<task>), shown read only under it.
// A cleanup that deletes a worktree folder leaves the branch; the next run (runner or the owner bot's start_task)
// adds the worktree back from that branch.

export const MAX_REPOS = 10

export interface RepoView { source: string; exists: boolean; git: boolean; workspace: string; worktree: (TaskRepo['worktree'] & { state: 'present' | 'missing' }) | null }

export function reposOf(data: TaskData): TaskRepo[] {
  if (data.repos) return data.repos
  const source = data.source_repo ?? data.repo
  return source ? [{ source, worktree: data.worktree ?? null }] : []
}

// The folder a run works in for one repository: its worktree (the matching sub-folder) or the folder itself.
function workspaceOf(repo: TaskRepo): string {
  return repo.worktree ? worktreeFolder(repo.worktree, repo.source) : repo.source
}

export function repoViews(data: TaskData): RepoView[] {
  return reposOf(data).map((repo) => {
    const info = pathInfo(repo.source)
    return {
      source: repo.source, exists: info.exists, git: info.git, workspace: workspaceOf(repo),
      worktree: repo.worktree ? { ...repo.worktree, state: existsSync(repo.worktree.path) ? 'present' : 'missing' } : null,
    }
  })
}

// The data fields that follow the repository list: the first repository is the main workspace.
function mirrored(repos: TaskRepo[], useWorktree: boolean): Partial<TaskData> {
  const first = repos[0]
  if (!first) return { repos: [], use_worktree: useWorktree, repo: undefined, source_repo: undefined, worktree: undefined }
  return {
    repos, use_worktree: useWorktree, repo: workspaceOf(first),
    source_repo: first.worktree ? first.source : undefined, worktree: first.worktree ?? undefined,
    ...(first.worktree ? { base_commit: first.worktree.base } : {}),
  }
}

// Sets the task's repositories. Kept entries keep their worktree; new git ones get one when worktrees are on. Turning
// worktrees off stops using them (the folders stay; the user's checkout becomes the workspace). Returns the data patch.
export function planRepos(config: Config, taskId: string, data: TaskData, sources: string[], useWorktree: boolean): Partial<TaskData> {
  if (sources.length > MAX_REPOS) throw new Error(`a task has at most ${MAX_REPOS} repositories`)
  const current = new Map(reposOf(data).map((repo) => [repo.source, repo]))
  const seen = new Set<string>()
  const repos: TaskRepo[] = []
  for (const raw of sources) {
    const source = raw.trim().replace(/\/+$/, '') || '/'
    if (seen.has(source)) continue
    seen.add(source)
    if (!isAbsolute(source)) throw new Error(`${source} must be an absolute folder path`)
    const info = pathInfo(source)
    if (!info.exists) throw new Error(`${source} is not a folder on this computer`)
    const kept = current.get(source)
    let worktree = useWorktree ? kept?.worktree ?? null : null
    // Two folders of one repository (packages of a monorepo) share its one worktree; worktreeFolder maps each.
    const sibling = info.top ? repos.find((r) => r.worktree && pathInfo(r.source).top === info.top)?.worktree : undefined
    if (useWorktree && !worktree && info.git) worktree = sibling ?? createWorktree(config, source, taskId, repos.length)
    repos.push({ source, worktree })
  }
  return mirrored(repos, useWorktree)
}

// Adds back every worktree a cleanup deleted, from the task's branch (or a new one from the recorded base when the
// branch is gone too). Returns the paths it made, for the run's events and the bot's answer.
export function ensureWorktrees(task: Task): string[] {
  const made: string[] = []
  for (const repo of reposOf(task.data)) {
    const worktree = repo.worktree
    if (!worktree || existsSync(worktree.path)) continue
    const info = pathInfo(repo.source)
    if (!info.git || !info.top) continue
    const git = (args: string[]) => execFileSync('git', ['-C', info.top!, ...args], { encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] })
    git(['worktree', 'prune'])
    const branchExists = (() => {
      try {
        git(['rev-parse', '--verify', '--quiet', `refs/heads/${worktree.branch}`])
        return true
      } catch {
        return false
      }
    })()
    git(branchExists ? ['worktree', 'add', worktree.path, worktree.branch] : ['worktree', 'add', '-b', worktree.branch, worktree.path, worktree.base])
    made.push(worktree.path)
  }
  return made
}

export type { Worktree }
