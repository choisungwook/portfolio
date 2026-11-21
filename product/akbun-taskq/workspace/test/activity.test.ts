import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addTurnStep, postMessage } from '../src/db/team.ts'
import { botActivity, pullRequestUrls, workdirChanges } from '../src/team/activity.ts'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { seedTestBots, setup } from './helpers.ts'

test('pull request links are found once each, newest text first', () => {
  const a = 'https://github.com/o/r/pull/2'
  const b = 'https://github.com/o/r/pull/1'
  assert.deepEqual(pullRequestUrls([`opened ${a}`, `see ${b} and ${a}`, 'https://github.com/o/r/issues/3']), [a, b])
})

test('the side panel keeps open and unknown PRs and drops merged ones', async () => {
  const env = setup()
  try {
    await seedTestBots(env.db)
    postMessage(env.db, { sender: 'coder', recipient: 'user', body: 'PR https://github.com/o/r/pull/7 and https://github.com/o/r/pull/8 and https://github.com/o/r/pull/9' })
    const states: Record<string, { state: string; title: string } | null> = {
      'https://github.com/o/r/pull/7': { state: 'OPEN', title: 'Add retry' },
      'https://github.com/o/r/pull/8': { state: 'MERGED', title: 'Old' },
      'https://github.com/o/r/pull/9': null,
    }
    const a = await botActivity(env.db, 'coder', async (url) => states[url])
    assert.deepEqual(a.pull_requests.map((pr) => [pr.number, pr.title, pr.state]), [[7, 'Add retry', 'OPEN'], [9, null, 'unknown']])
  } finally {
    env.cleanup()
  }
})

test('a step keeps the command short and masked, and send_message is not a step', async () => {
  const env = setup()
  try {
    await seedTestBots(env.db)
    addTurnStep(env.db, 1, 'coder', 'Bash', { command: `curl -H "Authorization: Bearer sk-ant-${'a'.repeat(40)}" ${'x'.repeat(300)}` })
    addTurnStep(env.db, 1, 'coder', 'mcp__team__send_message', { to: 'user', body: 'hi' })
    const rows = env.db.prepare('SELECT tool, detail FROM team_turn_steps').all() as { tool: string; detail: string }[]
    assert.equal(rows.length, 1)
    assert.ok(!rows[0].detail.includes('sk-ant-aaaa'), 'the key is masked')
    assert.ok(rows[0].detail.length <= 201)
  } finally {
    env.cleanup()
  }
})

test('the Changes row sums what the bot changed and did not commit in its git folder, and is null outside git', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'taskq-changes-'))
  try {
    assert.equal(await workdirChanges(dir), null)
    const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
    git('init', '-q', '-b', 'main')
    git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start')
    writeFileSync(join(dir, 'a.txt'), 'one\ntwo\n')
    git('add', 'a.txt')
    git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'a')
    writeFileSync(join(dir, 'a.txt'), 'one\nthree\nfour\n')
    writeFileSync(join(dir, 'new.txt'), 'x\n')
    const changes = (await workdirChanges(dir))!
    assert.deepEqual({ ...changes, path: undefined }, { repo: basename(dir), path: undefined, branch: 'main', files: 2, additions: 2, deletions: 1 })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
