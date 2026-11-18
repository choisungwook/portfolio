import type { Hono } from 'hono'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from '../db/open.ts'
import { getTask } from '../db/tasks.ts'
import type { Task } from '../types.ts'
import {
  changedFiles, commitsAhead, compareUrl, fileDiff, findPrUrl, githubRepoUrl, pathInfo, removeWorktree, vscodeUrl,
} from '../workspace/worktree.ts'
import { HttpError, type ApiDeps } from './http.ts'

// Where a task works: the repository or folder the user picked, or the task's own worktree, with its changes, the
// pull request link and a VS Code link, as Claude Desktop shows next to a session.

const SCAN_DEPTH = 2

function reposUnder(root: string, depth: number, out: Set<string>): void {
  if (out.size > 200 || !existsSync(root)) return
  if (existsSync(join(root, '.git'))) {
    out.add(root)
    return
  }
  if (depth === 0) return
  let names: string[] = []
  try {
    names = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules').map((d) => d.name)
  } catch {
    return
  }
  for (const name of names) reposUnder(join(root, name), depth - 1, out)
}

function textsAbout(db: Db, task: Task): string[] {
  const runs = db.prepare('SELECT summary FROM runs WHERE task_id = ? AND summary IS NOT NULL ORDER BY started_at DESC LIMIT 20').all(task.id).map((r) => String(r.summary))
  const messages = db.prepare('SELECT body FROM team_messages WHERE task_id = ? ORDER BY id DESC LIMIT 50').all(task.id).map((r) => String(r.body))
  return [...runs, ...messages]
}

export function workspaceOf(db: Db, task: Task) {
  const path = task.data.repo ?? null
  if (!path) return { kind: 'none' as const, path: null }
  const worktree = task.data.worktree
  const source = task.data.source_repo ?? path
  const info = pathInfo(source)
  const remote = info.remote
  const base = {
    path, source_repo: task.data.source_repo ?? null, exists: existsSync(path), git: info.git, branch: info.branch ?? null,
    repo_url: githubRepoUrl(remote) ?? null, pr_url: findPrUrl(remote, textsAbout(db, task)) ?? null, vscode_url: vscodeUrl(path),
  }
  if (!worktree) return { ...base, kind: info.git ? 'repo' as const : 'folder' as const }
  const present = existsSync(worktree.path)
  return {
    ...base, kind: 'worktree' as const, worktree, branch: worktree.branch,
    files: present ? changedFiles(worktree) : [], commits_ahead: present ? commitsAhead(worktree) : 0,
    compare_url: compareUrl(remote, worktree) ?? null, removed: !present,
  }
}

export function registerWorkspaceRoutes(api: Hono, { db, config }: ApiDeps): void {
  // Repositories to pick from: trustedRepos, git repositories under bots.readRoots, and repositories recent tasks used.
  api.get('/repos', (c) => {
    const found = new Set<string>(config.trustedRepos.filter((path) => existsSync(path)))
    for (const root of config.bots.readRoots) reposUnder(root, SCAN_DEPTH, found)
    for (const row of db.prepare(`SELECT DISTINCT coalesce(json_extract(data, '$.source_repo'), json_extract(data, '$.repo')) AS repo
      FROM tasks WHERE json_extract(data, '$.repo') IS NOT NULL ORDER BY updated_at DESC LIMIT 50`).all()) {
      const repo = String(row.repo)
      if (existsSync(repo) && !repo.startsWith(join(config.home, 'worktrees'))) found.add(repo)
    }
    return c.json([...found].sort().map((path) => ({ path, ...pathInfo(path) })))
  })

  // What a path is, for the task form: missing, a plain folder, or a git repository (with its branch).
  api.get('/paths/check', (c) => c.json(pathInfo(c.req.query('path') ?? '')))

  api.get('/tasks/:id/workspace', (c) => {
    const task = getTask(db, c.req.param('id'))
    if (!task) throw new HttpError(404, 'task not found')
    return c.json(workspaceOf(db, task))
  })

  api.get('/tasks/:id/workspace/diff', (c) => {
    const task = getTask(db, c.req.param('id'))
    if (!task?.data.worktree) throw new HttpError(404, 'this task has no worktree')
    try {
      return c.text(fileDiff(task.data.worktree, c.req.query('file') ?? ''))
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : String(error))
    }
  })

  // Removes the worktree folder; the branch stays in the repository, so the work is not lost. The task keeps pointing at
  // the removed folder, so a later run fails instead of writing into the user's own checkout.
  api.post('/tasks/:id/workspace/remove', (c) => {
    const task = getTask(db, c.req.param('id'))
    if (!task?.data.worktree || !task.data.source_repo) throw new HttpError(404, 'this task has no worktree')
    if (task.status === 'running') throw new HttpError(409, 'the task is running in this worktree')
    if (existsSync(task.data.worktree.path)) removeWorktree(task.data.source_repo, task.data.worktree)
    return c.json(workspaceOf(db, task))
  })
}
