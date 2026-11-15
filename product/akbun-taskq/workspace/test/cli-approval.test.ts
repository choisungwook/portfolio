import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { escapeControls } from '../src/cli/approvals.ts'
import { openDb } from '../src/db/open.ts'
import { approvalDecision, insertApproval, openApproval } from '../src/db/approvals.ts'
import { insertTask, setStatus } from '../src/db/tasks.ts'

const mkTemp = () => mkdtempSync(join(tmpdir(), 'taskq-cli-'))
const cleanTemp = (dir: string) => rmSync(dir, { recursive: true, force: true })

const CLI = resolve('bin/taskq')

test('control and invisible characters are shown as escapes', () => {
  assert.equal(escapeControls('a\nb\x01c\x7f'), 'a\\x0ab\\x01c\\x7f')
  assert.equal(escapeControls('x y​z‮'), 'x\\u{2028}y\\u{200b}z\\u{202e}')
  assert.equal(escapeControls('plain text'), 'plain text')
})

test('approve without a terminal needs --request and --yes, and binds the request id', () => {
  const home = mkTemp()
  try {
    const db = openDb(home)
    const task = insertTask(db, { type: 'ops_change', status: 'needs_approval', data: { intent: 'cli' } })
    insertApproval(db, { request_id: 'req-cli', task_id: task.id, run_id: 'run-cli', tool: 'Bash', input: '{"command":"echo a\\nb"}', created_at: 1 })
    db.close()
    const env = { ...process.env, TASKQ_HOME: home, TASKQ_NO_NOTIFY: '1' }
    const run = (args: string[]) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8' })

    const refused = run(['approve', task.id])
    assert.equal(refused.status, 1)
    assert.match(refused.stderr, /non-interactive use needs --request <request_id> --yes/)

    const wrong = run(['deny', task.id, '--request', 'stale', '--yes'])
    assert.equal(wrong.status, 1)
    assert.match(wrong.stderr, /not the open approval request/)

    const shown = run(['approve', task.id, '--request', 'req-cli', '--yes'])
    assert.equal(shown.status, 0, shown.stderr)
    assert.match(shown.stdout, /request req-cli  tool Bash  \d+ bytes/)
    assert.match(shown.stdout, /"command": "echo a\\nb"/)
    assert.match(shown.stdout, /approved/)

    const check = openDb(home)
    assert.equal(openApproval(check, task.id), null)
    assert.equal(approvalDecision(check, 'req-cli'), 'approved')
    check.close()
  } finally {
    cleanTemp(home)
  }
})

test('show prints the pending request with its input', () => {
  const home = mkTemp()
  try {
    const db = openDb(home)
    const task = insertTask(db, { type: 'ops_change', status: 'ready', data: { intent: 'show me' } })
    setStatus(db, task.id, 'needs_approval')
    insertApproval(db, { request_id: 'req-show', task_id: task.id, run_id: 'run-show', tool: 'Bash', input: '{"command":"ls"}', created_at: 1 })
    db.close()
    const out = spawnSync(process.execPath, [CLI, 'show', task.id], {
      env: { ...process.env, TASKQ_HOME: home, TASKQ_NO_NOTIFY: '1' }, encoding: 'utf8',
    })
    assert.equal(out.status, 0, out.stderr)
    assert.match(out.stdout, /pending approval req-show  tool Bash/)
    assert.match(out.stdout, /"command": "ls"/)
  } finally {
    cleanTemp(home)
  }
})
