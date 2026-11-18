import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from '../src/api/server.ts'
import { insertRun } from '../src/db/runs.ts'
import { setup, TOKEN, type TestEnv } from './helpers.ts'

// A code task in a git repository works in its own worktree; the task detail shows its path, branch, changed files,
// diff, pull request link and a VS Code link.

function gitRepo(dir: string): string {
  mkdirSync(dir, { recursive: true })
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { stdio: 'ignore' })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(dir, 'README.md'), 'hello\n')
  git('add', '.')
  git('commit', '-q', '-m', 'init')
  git('remote', 'add', 'origin', 'git@github.com:someone/app.git')
  return dir
}

describe('task workspace', () => {
  let env: TestEnv
  test.beforeEach(() => { env = setup() })
  test.afterEach(() => env.cleanup())

  const headers = { 'x-taskq-token': TOKEN, 'content-type': 'application/json' }
  const call = (method: string, path: string, body?: unknown) =>
    createApp({ db: env.db, config: env.config }, TOKEN).request(`/api${path}`, {
      method, headers: { ...headers, host: `127.0.0.1:${env.config.port}` }, body: body === undefined ? undefined : JSON.stringify(body),
    })

  test('[critical] a code task in a git repository gets its own worktree and branch; the user\'s checkout is untouched', async () => {
    const repo = gitRepo(join(env.home, 'src', 'app'))
    const res = await call('POST', '/tasks', { type: 'code', intent: 'fix the readme', repo })
    assert.equal(res.status, 201)
    const task = await res.json() as { id: string; data: { repo: string; source_repo: string; worktree: { branch: string; path: string; base: string }; base_commit: string } }
    assert.equal(task.data.source_repo, repo)
    assert.equal(task.data.repo, join(env.home, 'worktrees', `app-${task.id}`))
    assert.equal(task.data.worktree.branch, `taskq/${task.id}`)
    assert.equal(task.data.base_commit, task.data.worktree.base)
    writeFileSync(join(task.data.repo, 'README.md'), 'hello\nworld\n')
    writeFileSync(join(task.data.repo, 'new.txt'), 'new\n')
    assert.equal(readFileSync(join(repo, 'README.md'), 'utf8'), 'hello\n', 'the source checkout does not change')

    const ws = await (await call('GET', `/tasks/${task.id}/workspace`)).json() as {
      kind: string; files: { path: string; status: string; additions: number | null }[]; compare_url: string; vscode_url: string; pr_url: string | null
    }
    assert.equal(ws.kind, 'worktree')
    assert.deepEqual(ws.files.map((f) => [f.path, f.status]), [['README.md', 'modified'], ['new.txt', 'untracked']])
    assert.equal(ws.compare_url, `https://github.com/someone/app/compare/main...taskq%2F${task.id}?expand=1`)
    assert.equal(ws.vscode_url, `vscode://file${task.data.repo}`)
    assert.equal(ws.pr_url, null)
    const diff = await (await call('GET', `/tasks/${task.id}/workspace/diff?file=README.md`)).text()
    assert.match(diff, /\+world/)
    assert.equal((await call('GET', `/tasks/${task.id}/workspace/diff?file=../../etc/passwd`)).status, 400)

    insertRun(env.db, { id: 'r1', task_id: task.id, session_id: null, started_at: 1, output_path: undefined })
    env.db.prepare('UPDATE runs SET summary = ? WHERE id = ?').run('Opened https://github.com/someone/app/pull/42 for review', 'r1')
    const withPr = await (await call('GET', `/tasks/${task.id}/workspace`)).json() as { pr_url: string }
    assert.equal(withPr.pr_url, 'https://github.com/someone/app/pull/42')

    const refused = await call('POST', `/tasks/${task.id}/workspace/remove`)
    assert.equal(refused.status, 409, 'uncommitted work is not thrown away without asking')
    assert.ok(existsSync(task.data.repo))
    const removed = await (await call('POST', `/tasks/${task.id}/workspace/remove`, { discard: true })).json() as { removed: boolean }
    assert.equal(removed.removed, true)
    assert.equal(existsSync(task.data.repo), false)
    assert.match(execFileSync('git', ['-C', repo, 'branch', '--list', `taskq/${task.id}`], { encoding: 'utf8' }), /taskq\//, 'the branch is kept')
  })

  test('[critical] non-ASCII and renamed files show with their real paths and diffs; a picked subfolder stays the working folder', async () => {
    const repo = gitRepo(join(env.home, 'src', 'mono'))
    const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, '-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { stdio: 'ignore' })
    mkdirSync(join(repo, 'packages', 'web'), { recursive: true })
    writeFileSync(join(repo, 'packages', 'web', 'a.ts'), 'export const a = 1\n')
    writeFileSync(join(repo, '한글.md'), '가\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'more')
    const task = await (await call('POST', '/tasks', { type: 'code', intent: 'web work', repo: join(repo, 'packages', 'web') })).json() as { id: string; data: { repo: string; worktree: { path: string } } }
    assert.equal(task.data.repo, join(task.data.worktree.path, 'packages', 'web'))
    const root = task.data.worktree.path
    writeFileSync(join(root, '한글.md'), '가\n나\n')
    writeFileSync(join(root, '새파일.md'), 'new\n')
    git(root, 'mv', 'packages/web/a.ts', 'packages/web/b.ts')
    const ws = await (await call('GET', `/tasks/${task.id}/workspace`)).json() as { files: { path: string; status: string }[] }
    assert.deepEqual(ws.files.map((f) => [f.path, f.status]).sort(), [['packages/web/b.ts', 'renamed'], ['새파일.md', 'untracked'], ['한글.md', 'modified']])
    assert.match(await (await call('GET', `/tasks/${task.id}/workspace/diff?file=${encodeURIComponent('한글.md')}`)).text(), /\+나/)
    assert.match(await (await call('GET', `/tasks/${task.id}/workspace/diff?file=${encodeURIComponent('새파일.md')}`)).text(), /\+new/)
    env.config.trustedRepos = [join(repo, 'packages', 'web')]
    const { profileFor } = await import('../src/agents/claude/profiles.ts')
    const { getTask } = await import('../src/db/tasks.ts')
    assert.deepEqual(profileFor(getTask(env.db, task.id)!, env.config).settingSources, ['user', 'project'], 'trust follows the repository the user picked')
  })

  test('no worktree for a read task, a plain folder, or when the user turns it off', async () => {
    const repo = gitRepo(join(env.home, 'src', 'lib'))
    const folder = join(env.home, 'notes')
    mkdirSync(folder)
    const read = await (await call('POST', '/tasks', { type: 'research', intent: 'read it', repo })).json() as { data: { repo: string; worktree?: unknown } }
    assert.equal(read.data.repo, repo)
    assert.equal(read.data.worktree, undefined)
    const off = await (await call('POST', '/tasks', { type: 'code', intent: 'in place', repo, worktree: false })).json() as { data: { repo: string; worktree?: unknown } }
    assert.equal(off.data.repo, repo)
    const plain = await (await call('POST', '/tasks', { type: 'code', intent: 'plain', repo: folder })).json() as { id: string; data: { repo: string } }
    assert.equal(plain.data.repo, folder)
    assert.equal(((await (await call('GET', `/tasks/${plain.id}/workspace`)).json()) as { kind: string }).kind, 'folder')
    const info = await (await call('GET', `/paths/check?path=${encodeURIComponent(repo)}`)).json() as { exists: boolean; git: boolean; top: string; branch: string; remote: string }
    assert.deepEqual([info.exists, info.git, info.top, info.branch], [true, true, repo, 'main'])
    assert.match(info.remote, /github\.com[:/]someone\/app/, 'a git insteadOf rule may rewrite the URL form')
    env.config.trustedRepos = [repo]
    const repos = await (await call('GET', '/repos')).json() as { path: string; git: boolean }[]
    assert.ok(repos.some((r) => r.path === repo && r.git))
  })
})
