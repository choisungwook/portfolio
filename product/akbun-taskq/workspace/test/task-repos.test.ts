import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from '../src/api/server.ts'
import { createFromInput, getTask } from '../src/db/tasks.ts'
import { ensureWorktrees, repoViews } from '../src/workspace/task-repos.ts'
import { decide } from '../src/worker/gate.ts'
import { setup, TOKEN } from './helpers.ts'

function gitRepo(dir: string): string {
  mkdirSync(dir, { recursive: true })
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(dir, 'README.md'), 'hi\n')
  git('add', '.')
  git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'start')
  return dir
}

test('a task lists several repositories, shows each worktree read only, and a deleted worktree comes back', async () => {
  const env = setup()
  try {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    const headers = { host: `127.0.0.1:${env.config.port}`, 'x-taskq-token': TOKEN, 'content-type': 'application/json' }
    const api = gitRepo(join(env.home, 'src', 'api'))
    const web = gitRepo(join(env.home, 'src', 'web'))
    const notes = join(env.home, 'src', 'notes')
    mkdirSync(notes, { recursive: true })
    const task = createFromInput(env.db, { type: 'code', status: 'draft', priority: 0, lock_key: null, depends_on: [], data: { intent: 'change both', repo: api } }, null, env.config)
    assert.equal(repoViews(task.data)[0].worktree?.state, 'present')

    const patch = (body: object) => app.request(`/api/tasks/${task.id}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
    assert.equal((await patch({ repos: [api, web, notes] })).status, 200)
    const views = repoViews(getTask(env.db, task.id)!.data)
    assert.deepEqual(views.map((v) => [v.source, v.git, v.worktree === null]), [[api, true, false], [web, true, false], [notes, false, true]])
    assert.equal(getTask(env.db, task.id)!.data.repo, views[0].workspace, 'the first repository stays the main workspace')
    assert.equal((await patch({ repos: ['relative/path'] })).status, 400)

    // A cleanup deletes the second worktree folder: it shows as missing, and the next run adds it back from its branch.
    rmSync(views[1].worktree!.path, { recursive: true, force: true })
    assert.equal(repoViews(getTask(env.db, task.id)!.data)[1].worktree?.state, 'missing')
    assert.deepEqual(ensureWorktrees(getTask(env.db, task.id)!), [views[1].worktree!.path])
    assert.equal(repoViews(getTask(env.db, task.id)!.data)[1].worktree?.state, 'present')

    // A code run may write in every repository's workspace, not elsewhere.
    const ctx = { cwd: views[0].workspace, outputs: join(env.home, 'outputs'), repo: views[0].workspace, extraRepos: [views[1].workspace], dataDir: join(env.home, 'data') }
    assert.equal(decide('code', 'Write', { file_path: join(views[1].workspace, 'x.ts'), content: '' }, ctx), 'allow')
    assert.equal(decide('code', 'Write', { file_path: join(env.home, 'elsewhere.ts'), content: '' }, ctx), 'deny')

    // Turning worktrees off makes the user's folders the workspaces; turning them on again reuses the same worktrees.
    assert.equal((await patch({ use_worktree: false })).status, 200)
    assert.deepEqual(repoViews(getTask(env.db, task.id)!.data).map((v) => v.workspace), [api, web, notes])
    assert.equal((await patch({ use_worktree: true })).status, 200, 'the task branch already exists: it is reused, not refused')
    assert.deepEqual(repoViews(getTask(env.db, task.id)!.data).map((v) => v.worktree?.path), views.map((v) => v.worktree?.path))

    // Two folders of one repository share its worktree.
    const pkg = join(api, 'pkg')
    mkdirSync(pkg)
    assert.equal((await patch({ repos: [api, pkg] })).status, 200)
    const shared = repoViews(getTask(env.db, task.id)!.data)
    assert.equal(shared[1].worktree?.path, shared[0].worktree?.path)
    assert.equal(shared[1].workspace, join(shared[0].worktree!.path, 'pkg'))
  } finally {
    env.cleanup()
  }
})
