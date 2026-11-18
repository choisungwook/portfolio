import { test } from 'node:test'
import assert from 'node:assert/strict'
import { raiseAlert } from '../src/alerts/rules.ts'
import { desktopCommand, noticeFor, type Notice } from '../src/alerts/notify.ts'
import { sendHandoffNotices } from '../src/alerts/handoffs.ts'
import { listAlerts } from '../src/db/alerts.ts'
import { setDesktopNotifications } from '../src/db/meta.ts'
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

test('Windows and WSL launch the same PowerShell notification with Unicode data', () => {
  const notice = { title: 'taskq · 인계', body: "수락: '$(literal)'\n확인" }
  const command = desktopCommand(notice, 'win32')
  assert.ok(command)
  assert.equal(command.file, 'powershell.exe')
  assert.deepEqual(desktopCommand(notice, 'linux', '/run/WSL/interop'), command)
  assert.deepEqual(desktopCommand(notice, 'linux', undefined, '6.6.87.2-microsoft-standard-WSL2'), command)
  assert.equal(desktopCommand(notice, 'linux'), undefined)
  assert.deepEqual(desktopCommand(notice, 'darwin')?.args.slice(-2), Object.values(notice))
  assert.equal(command.args.at(-2), '-EncodedCommand')
  const script = Buffer.from(command.args.at(-1) ?? '', 'base64').toString('utf16le')
  const payload = script.match(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/)?.[1]
  assert.ok(payload)
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64').toString('utf8')), notice)
  assert.match(script, /ShowBalloonTip/)
  assert.doesNotMatch(script, /literal/)
})

test('[critical] disabling desktop notifications keeps handoff and critical alert history without replay', (t) => {
  const env = setup()
  t.after(env.cleanup)
  const { db } = env
  const source = addTask(db, { status: 'done' })
  const sent: Notice[] = []
  const notify = (notice: Notice) => sent.push(notice)
  setDesktopNotifications(db, false)
  addTask(db, { deps: [{ depends_on: source.id, kind: 'blocks' }] })
  raiseAlert(db, { task_id: null, kind: 'security_finding', message: 'Test finding' }, notify)
  sendHandoffNotices(db, notify)
  assert.deepEqual(sent, [])
  assert.deepEqual(listAlerts(db, true).map((alert) => alert.kind).sort(), ['handoff_received', 'security_finding'])

  addTask(db, { deps: [{ depends_on: source.id, kind: 'blocks' }] })
  setDesktopNotifications(db, true)
  sendHandoffNotices(db, notify)
  assert.deepEqual(sent, [])
  addTask(db, { deps: [{ depends_on: source.id, kind: 'blocks' }] })
  sendHandoffNotices(db, notify)
  raiseAlert(db, { task_id: null, kind: 'security_finding', message: 'Another finding' }, notify)
  assert.equal(sent.length, 2)
})
