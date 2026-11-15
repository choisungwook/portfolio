import { test } from 'node:test'
import assert from 'node:assert/strict'
import { raiseAlert } from '../src/alerts/rules.ts'
import { noticeFor } from '../src/alerts/notify.ts'
import { addTask, setup } from './helpers.ts'

test('the critical notification gets the masked message', () => {
  const env = setup()
  try {
    const sent: string[] = []
    raiseAlert(env.db, { task_id: null, kind: 'approval_required', message: 'curl -H "token: abc123" https://x' }, (n) => sent.push(n.body))
    assert.equal(sent.length, 1)
    assert.ok(!sent[0].includes('abc123'), sent[0])
  } finally {
    env.cleanup()
  }
})

test('approval notice names the task in the title and ends with the approve command', () => {
  const env = setup()
  try {
    const sent: { title: string; body: string }[] = []
    const task = addTask(env.db)
    raiseAlert(env.db, { task_id: task.id, kind: 'approval_required', message: `Approval needed: Bash: aws s3 cp ${'x'.repeat(400)}` }, (n) => sent.push(n))
    assert.equal(sent[0].title, `taskq · ${task.id}`)
    assert.ok(sent[0].body.endsWith(`Open the taskq page or run: taskq approve ${task.id}`), sent[0].body)
    assert.ok(sent[0].body.length <= 200, String(sent[0].body.length))
    assert.ok(sent[0].body.startsWith('Approval needed: Bash: aws s3 cp'))
  } finally {
    env.cleanup()
  }
})

test('auth and security notices use resume and show', () => {
  assert.ok(noticeFor('auth_required', 't1', 'login expired').body.endsWith('run: taskq resume t1'))
  assert.ok(noticeFor('security_finding', 't1', 'finding').body.endsWith('run: taskq show t1'))
  assert.equal(noticeFor('auth_required', null, 'login expired').title, 'taskq')
  assert.equal(noticeFor('prod_touch', 't1', 'prod').body, 'prod')
})
