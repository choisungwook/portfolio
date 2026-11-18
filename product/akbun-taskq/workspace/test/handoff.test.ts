import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { endRun, insertRun, listRunsOfTask } from '../src/db/runs.ts'
import { acceptHandoff, listHandoffs, setHandoffMode } from '../src/db/handoffs.ts'
import { claimTask, moveStatus, patchData } from '../src/db/tasks.ts'
import { listAlerts } from '../src/db/alerts.ts'
import { sendHandoffNotices } from '../src/alerts/handoffs.ts'
import type { Notice } from '../src/alerts/notify.ts'
import type { HandoffRecord } from '../src/types.ts'
import { createApp } from '../src/api/server.ts'
import { buildPrompt } from '../src/worker/prompt.ts'
import { addTask, fakeWorker, result, setup, startRunner, stopRunners, waitFor, statusOf, TOKEN } from './helpers.ts'

test('[critical] a dependent run receives the artifact only after the prerequisite is marked done', async (t) => {
  const env = setup()
  t.after(async () => {
    await stopRunners()
    env.cleanup()
  })
  const { db, config, home } = env
  const outputs = join(home, 'outputs')
  const intent = addTask(db, { data: { intent: 'Write an intent', output_path: 'intent.md' } })
  const incidental = addTask(db, { status: 'done', data: { intent: 'Other work', output_path: 'elsewhere.md' } })
  const spec = addTask(db, {
    data: { intent: 'Write the design' },
    deps: [{ depends_on: intent.id, kind: 'blocks' }, { depends_on: incidental.id, kind: 'discovered_from' }],
  })
  let prompt = ''
  const worker = fakeWorker((ctx) => {
    if (ctx.task.id === intent.id) {
      writeFileSync(join(outputs, 'intent.md'), '# Intent\n')
      return result('done', 'Intent prepared')
    }
    prompt = buildPrompt(ctx, outputs)
    return result('done')
  })
  const runner = startRunner({ db, config, worker })
  await runner.start()
  await waitFor(() => statusOf(db, intent.id) === 'review')
  assert.equal(claimTask(db, spec.id, 'other-runner'), false)
  assert.equal(prompt, '')

  patchData(db, intent.id, { output_path: 'different.md' })
  assert.equal(moveStatus(db, intent.id, 'review', 'done'), true)
  await waitFor(() => statusOf(db, spec.id) === 'review')
  const handoffLine = prompt.split('\n').find((line) => line.startsWith('{'))
  assert.ok(handoffLine)
  const handoff = JSON.parse(handoffLine)
  assert.deepEqual(handoff, {
    handoff_id: listHandoffs(db, spec.id)[0].id,
    task_id: intent.id,
    run_id: listRunsOfTask(db, intent.id)[0].id,
    artifact: join(outputs, 'intent.md'),
    summary: 'Intent prepared',
    accepted_via: 'auto',
  })
  assert.doesNotMatch(prompt, /elsewhere\.md/)
})

test('[critical] a manual handoff persists its alert and blocks claims until the operator accepts it', async (t) => {
  const env = setup()
  t.after(env.cleanup)
  const { db, config } = env
  const draft = addTask(db, { status: 'review', data: { intent: 'Draft', output_path: 'intent.md' } })
  const spec = addTask(db, {
    data: { intent: 'Spec', auto_accept_handoffs: false },
    deps: [{ kind: 'blocks', depends_on: draft.id }],
  })
  const app = createApp(env, TOKEN)
  const headers = { host: `127.0.0.1:${config.port}`, 'x-taskq-token': TOKEN, 'content-type': 'application/json' }
  const post = (path: string, body = {}) => app.request(`/api/${path}`, { method: 'POST', headers, body: JSON.stringify(body) })

  assert.deepEqual(listHandoffs(db, spec.id), [])
  assert.equal((await post(`tasks/${draft.id}/done`)).status, 200)
  const [handoff] = listHandoffs(db, spec.id)
  assert.equal(handoff.status, 'pending')
  assert.equal(handoff.accepted_at, null)
  assert.equal(claimTask(db, spec.id, 'runner'), false)
  assert.equal((await post(`tasks/${spec.id}/run`)).status, 409)
  assert.equal((await app.request('/api/handoffs', { headers: { host: headers.host } })).status, 401)

  const notices: Notice[] = []
  sendHandoffNotices(db, (notice) => notices.push(notice))
  sendHandoffNotices(db, (notice) => notices.push(notice))
  assert.equal(notices.length, 1)
  assert.match(notices[0].body, /waiting for acceptance/)
  assert.equal(listAlerts(db, true).filter((row) => row.kind === 'handoff_received').length, 1)
  assert.equal((await post(`handoffs/${handoff.id}/accept`)).status, 200)
  assert.equal((await post(`handoffs/${handoff.id}/accept`)).status, 409)
  const [accepted] = listHandoffs(db, spec.id)
  assert.equal(accepted.accepted_via, 'manual')
  assert.ok(accepted.accepted_at)
  assert.equal(claimTask(db, spec.id, 'runner'), true)
})

test('a newer run supersedes the old pending record and uses the persisted receiving mode', (t) => {
  const env = setup()
  t.after(env.cleanup)
  const { db } = env
  const source = addTask(db, { status: 'done' })
  const target = addTask(db, {
    data: { intent: 'Follow up', auto_accept_handoffs: false },
    deps: [{ depends_on: source.id, kind: 'blocks' }],
  })
  const original = listHandoffs(db, target.id)[0]
  assert.equal(original.status, 'pending')
  assert.equal(moveStatus(db, source.id, 'done', 'ready'), true)
  const now = Math.floor(Date.now() / 1000)
  insertRun(db, { id: 'new-run', task_id: source.id, session_id: null, started_at: now })
  endRun(db, { id: 'new-run', task_id: source.id, intent: source.data.intent, outcome: 'done', summary: 'New evidence', ended_at: now, stats: {} })
  assert.equal(moveStatus(db, source.id, 'ready', 'done'), true)
  const [fresh, superseded] = listHandoffs(db, target.id)
  assert.equal(fresh.run_id, 'new-run')
  assert.equal(superseded.status, 'superseded')
  assert.deepEqual(listAlerts(db, false).map((row) => row.ref), [String(fresh.id)])
  const notices: Notice[] = []
  sendHandoffNotices(db, (notice) => notices.push(notice))
  assert.equal(notices.length, 1)
  assert.match(notices[0].body, new RegExp(`Handoff #${fresh.id} `))
  assert.equal(acceptHandoff(db, original.id), false)
  assert.equal(setHandoffMode(db, target.id, true), true)
  assert.equal(listHandoffs(db, target.id)[0].accepted_via, 'auto')
  assert.equal(listHandoffs(db, target.id)[1].accepted_at, null)
})

test('CLI accepts a handoff and a stdio MCP client reads the same record and policy', async (t) => {
  const env = setup()
  t.after(env.cleanup)
  const { db, home } = env
  const source = addTask(db, { status: 'done' })
  const cliEnv = { TASKQ_HOME: home, TASKQ_NO_NOTIFY: '1' }
  const cli = (...args: string[]) => execFileSync(process.execPath, ['bin/taskq', ...args], {
    env: { ...process.env, ...cliEnv }, encoding: 'utf8',
  }).trim()
  const added = cli('add', '--type', 'research', '--intent', 'Read source result', '--depends-on', source.id, '--manual-handoffs')
  const targetId = added.split(' ')[0]
  const [pending] = JSON.parse(cli('handoffs', '--task', targetId))
  assert.equal(pending.status, 'pending')
  assert.equal(cli('handoff', 'mode', targetId), 'manual')
  assert.equal(cli('handoff', 'accept', String(pending.id)), `handoff ${pending.id} accepted`)

  const transport = new StdioClientTransport({ command: process.execPath, args: ['bin/taskq', 'mcp'], env: cliEnv, stderr: 'pipe' })
  const client = new Client({ name: 'taskq-test', version: '1.0.0' })
  try {
    await client.connect(transport)
    const list = await client.listTools()
    assert.equal(list.tools.length, 2)
    assert.ok(list.tools.every((tool) => tool.annotations?.readOnlyHint))
    const handoffs = await client.callTool({ name: 'taskq_list_handoffs', arguments: { task_id: targetId } })
    const [accepted] = (handoffs.structuredContent as { handoffs: HandoffRecord[] }).handoffs
    assert.equal(accepted.id, pending.id)
    assert.equal(accepted.accepted_via, 'manual')
    const mode = await client.callTool({ name: 'taskq_handoff_mode', arguments: { task_id: targetId } })
    assert.deepEqual(mode.structuredContent, { task_id: targetId, auto_accept: false })
  } finally {
    await client.close()
  }
})
