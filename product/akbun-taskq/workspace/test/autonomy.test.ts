import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/api/server.ts'
import { getAgent, listAgents, listMessages, postMessage, USER } from '../src/db/team.ts'
import { botGate, type ApprovalBroker } from '../src/team/bot-gate.ts'
import { consumeApproval, requestApproval } from '../src/db/bot-requests.ts'
import { createRoutine, runDueRoutines, runTriggeredRoutines } from '../src/db/routines.ts'
import { nextRun } from '../src/util/cron.ts'
import { systemFor } from '../src/team/prompt.ts'
import { teamTools } from '../src/team/tools.ts'
import { hybridSearch } from '../src/team/search.ts'
import { finishBotTask, startBotTask } from '../src/team/bot-work.ts'
import { insertEvent } from '../src/db/events.ts'
import { nowSec } from '../src/time.ts'
import { seedTestBots, setup, TOKEN, type TestEnv } from './helpers.ts'

// What bots do without the user in the loop each time, and where they stop for the user.

describe('bot autonomy', () => {
  let env: TestEnv
  test.beforeEach(async () => {
    env = setup()
    await seedTestBots(env.db)
  })
  test.afterEach(() => env.cleanup())

  const call = (method: string, path: string, body?: unknown) => createApp({ db: env.db, config: env.config }, TOKEN).request(`/api${path}`, {
    method, headers: { 'x-taskq-token': TOKEN, 'content-type': 'application/json', host: `127.0.0.1:${env.config.port}` },
    body: body === undefined ? (method === 'GET' || method === 'DELETE' ? undefined : '{}') : JSON.stringify(body),
  })
  const tool = (agent: string, name: string) => teamTools({ db: env.db, config: env.config, agent, search: hybridSearch(env.db) }).find((t) => t.name === name)!
  const broker = (bot: string): ApprovalBroker => ({
    consume: (t, c) => consumeApproval(env.db, bot, t, c),
    request: (t, c, rule) => requestApproval(env.db, bot, t, c, rule).id,
  })
  const inbox = (bot: string) => listMessages(env.db, { recipient: bot, limit: 20 }).sort((a, b) => a.id - b.id).map((m) => m.body)

  test('[critical] an irreversible command waits for approval, runs once after it, and the bot is told', async () => {
    const coder = getAgent(env.db, 'coder')!
    const push = { command: 'cd repo && git push origin main' }
    const first = botGate(env.config, coder, env.home, 'Bash', push, broker('coder'))
    assert.equal(first.action, 'deny')
    assert.match(first.action === 'deny' ? first.reason : '', /Request #1 is waiting/)
    assert.equal(botGate(env.config, coder, env.home, 'Bash', push, broker('coder')).action, 'deny', 'a retry does not stack a second request')
    const pending = (await (await call('GET', '/bot-approvals')).json()) as { id: number; rule: string }[]
    assert.deepEqual(pending.map((p) => [p.id, p.rule]), [[1, 'git push*']])
    const alert = env.db.prepare(`SELECT ref FROM alerts WHERE kind = 'approval_required'`).get()
    assert.equal(alert?.ref, 'bot-approval:1')

    assert.equal((await call('POST', '/bot-approvals/1', { approve: true })).status, 200)
    assert.match(inbox('coder').at(-1) ?? '', /approved request #1/)
    assert.equal(botGate(env.config, coder, env.home, 'Bash', push, broker('coder')).action, 'allow', 'approved once')
    assert.equal(botGate(env.config, coder, env.home, 'Bash', push, broker('coder')).action, 'deny', 'and only once')
    assert.equal((await call('POST', '/bot-approvals/1', { approve: false })).status, 409)

    assert.equal(botGate(env.config, coder, env.home, 'Bash', { command: 'git status' }, broker('coder')).action, 'allow', 'reversible work runs alone')
    for (const command of ['git -C /repo push origin main', 'kubectl -n prod delete deploy api', 'terraform -chdir=infra apply -auto-approve']) {
      assert.equal(botGate(env.config, coder, env.home, 'Bash', { command }, broker('coder')).action, 'deny', `${command}: options between tool and subcommand`)
    }
    const long = botGate(env.config, coder, env.home, 'Bash', { command: `git push ${'x'.repeat(4100)}` }, broker('coder'))
    assert.match(long.action === 'deny' ? long.reason : '', /too long to approve/)
    env.db.prepare(`UPDATE alerts SET acked_at = 1 WHERE kind = 'approval_required'`).run()
    botGate(env.config, coder, env.home, 'Bash', { command: 'git -C /repo push origin main' }, broker('coder'))
    const before = Number(env.db.prepare(`SELECT count(*) AS n FROM alerts WHERE kind = 'approval_required' AND acked_at IS NULL`).get()?.n)
    botGate(env.config, coder, env.home, 'Bash', { command: 'git -C /repo push origin main' }, broker('coder'))
    assert.equal(Number(env.db.prepare(`SELECT count(*) AS n FROM alerts WHERE kind = 'approval_required' AND acked_at IS NULL`).get()?.n), before, 'an open alert is not doubled')
    env.db.prepare(`UPDATE alerts SET acked_at = 1 WHERE kind = 'approval_required'`).run()
    botGate(env.config, coder, env.home, 'Bash', { command: 'git -C /repo push origin main' }, broker('coder'))
    assert.equal(Number(env.db.prepare(`SELECT count(*) AS n FROM alerts WHERE kind = 'approval_required' AND acked_at IS NULL`).get()?.n), 1, 'an acknowledged but undecided request asks again')
    const bypass = { ...coder, permission_mode: 'bypassPermissions' as const }
    assert.equal(botGate(env.config, bypass, env.home, 'Bash', push, broker('coder')).action, 'allow', 'bypass skips the built-in list')
    const own = { ...bypass, ask_first: ['git commit*', 'tool:mcp__gmail__send*'] }
    assert.equal(botGate(env.config, own, env.home, 'Bash', { command: 'git commit -m x' }, broker('coder')).action, 'deny', 'but not the bot\'s own rules')
    assert.equal(botGate(env.config, own, env.home, 'mcp__gmail__send_mail', { to: 'a' }, broker('coder')).action, 'deny')
    assert.equal(botGate(env.config, own, env.home, 'mcp__gmail__read', {}, broker('coder')).action, 'allow')
  })

  test('[critical] routines: cron in local time, due runs delivered once and tagged, triggers on new failures, webhooks', async () => {
    const saturday = Math.floor(new Date(2026, 10, 21, 12, 0).getTime() / 1000)
    assert.equal(nextRun('0 7 * * 1-5', saturday), Math.floor(new Date(2026, 10, 23, 7, 0).getTime() / 1000), 'next weekday 7am is Monday')
    assert.equal(nextRun('*/15 * * * *', Math.floor(new Date(2026, 10, 21, 12, 7).getTime() / 1000)), Math.floor(new Date(2026, 10, 21, 12, 15).getTime() / 1000))
    assert.equal(typeof createRoutine(env.db, { bot: 'coder', name: 'x', prompt: 'y', schedule: '61 * * * *', created_by: USER }), 'string')
    assert.match(String(createRoutine(env.db, { bot: 'coder', name: 'x', prompt: 'y', schedule: '0 0 31 2 *', created_by: USER })), /never comes due/)

    const routine = createRoutine(env.db, { bot: 'coder', name: 'Morning brief', prompt: 'Summarise failures', schedule: '0 7 * * *', created_by: USER })
    assert.ok(typeof routine !== 'string')
    assert.equal(runDueRoutines(env.db, (routine.next_run_at ?? 0) - 1), 0)
    assert.equal(runDueRoutines(env.db, (routine.next_run_at ?? 0) + 3 * 86_400), 1, 'missed runs come as one')
    const delivered = env.db.prepare('SELECT routine_id, sender, body FROM team_messages WHERE recipient = ? ORDER BY id DESC LIMIT 1').get('coder')
    assert.deepEqual([delivered?.routine_id, delivered?.sender], [routine.id, 'routine'])
    assert.match(String(delivered?.body), /Routine "Morning brief".*\nSummarise failures/s)

    const onFail = createRoutine(env.db, { bot: 'planner', name: 'Triage', prompt: 'Look at it', trigger: 'task_failed', created_by: USER })
    assert.ok(typeof onFail !== 'string')
    runTriggeredRoutines(env.db)
    const res = await call('POST', '/tasks', { type: 'research', intent: 'find the slow query', status: 'ready' })
    const task = (await res.json()) as { id: string }
    insertEvent(env.db, { task_id: task.id, run_id: null, kind: 'finished', payload: { outcome: 'failed' } })
    assert.equal(runTriggeredRoutines(env.db), 1)
    assert.equal(runTriggeredRoutines(env.db), 0, 'each failure fires once')
    assert.match(inbox('planner').at(-1) ?? '', new RegExp(`Failed since the last check:\\ntask ${task.id}: find the slow query`))

    const onNew = createRoutine(env.db, { bot: 'planner', name: 'Intake', prompt: 'Sort it', trigger: 'task_created', created_by: USER })
    assert.ok(typeof onNew !== 'string')
    runTriggeredRoutines(env.db)
    const fresh = (await (await call('POST', '/tasks', { type: 'research', intent: 'same second as the tick' })).json()) as { id: string }
    env.db.prepare('UPDATE tasks SET created_at = ? WHERE id = ?').run(nowSec() - 5, fresh.id)
    assert.equal(runTriggeredRoutines(env.db), 1, 'a task created in the same second as a tick still fires')
    assert.match(inbox('planner').at(-1) ?? '', /same second as the tick/)

    const hook = (await (await call('POST', '/routines', { bot: 'coder', name: 'Deploy hook', prompt: 'Check the deploy', trigger: 'webhook' })).json()) as { id: number }
    assert.equal((await call('POST', `/routines/${hook.id}/fire`, { text: 'build 42 finished' })).status, 200)
    assert.match(inbox('coder').at(-1) ?? '', /Webhook payload:\nbuild 42 finished/)
    assert.throws(() => tool('coder', 'schedule_routine').handler({ name: 'n', prompt: 'p', schedule: '0 9 * * *', bot: 'planner' }), /only coordinators/)
    assert.equal((tool('taskq', 'schedule_routine').handler({ name: 'n', prompt: 'p', schedule: '0 9 * * *', bot: 'planner' }) as { bot: string }).bot, 'planner')
  })

  test('the charter reaches the standing orders; ask_first and the charter are bot settings', async () => {
    const res = await call('PUT', '/bots/coder', { charter_owns: 'the export job', charter_good: 'tests pass', charter_never: 'force push', ask_first: ['git commit*'] })
    assert.equal(res.status, 200)
    const coder = getAgent(env.db, 'coder')!
    assert.deepEqual(coder.ask_first, ['git commit*'])
    const system = systemFor(coder, listAgents(env.db), env.config, env.home, env.home, env.home)
    assert.match(system, /Your charter:\nYou own: the export job\nGood work looks like: tests pass\nNever do these without asking the user first.*force push/)
  })

  test('[critical] a goal goes to taskq; only taskq closes it and the user is told', async () => {
    const goal = (await (await call('POST', '/goals', { objective: 'Ship the retry fix', done_when: 'deployed and passing' })).json()) as { id: number }
    assert.match(inbox('taskq').at(-1) ?? '', /Goal #1: Ship the retry fix\nDone when: deployed and passing/)
    assert.throws(() => tool('coder', 'close_goal').handler({ id: goal.id, status: 'done', summary: 'x' }), /only the orchestrator/)
    tool('taskq', 'close_goal').handler({ id: goal.id, status: 'done', summary: 'merged in #9, deploy green' })
    const goals = (await (await call('GET', '/goals')).json()) as { status: string; summary: string }[]
    assert.deepEqual([goals[0].status, goals[0].summary], ['done', 'merged in #9, deploy green'])
    assert.match(inbox('user').at(-1) ?? '', /Goal #1 done/)
    assert.equal((await call('POST', `/goals/${goal.id}/close`, { status: 'dropped' })).status, 409)
  })

  test('[critical] a finished task becomes a workflow draft from its run; the weekly review flags what to prune', async () => {
    const task = (await (await call('POST', '/tasks', { type: 'research', intent: 'rotate the logs', status: 'ready' })).json()) as { id: string }
    assert.equal((await call('POST', `/tasks/${task.id}/save-workflow`)).status, 409, 'only a done task')
    const now = nowSec()
    env.db.prepare(`INSERT INTO runs (id, task_id, session_id, started_at, ended_at, outcome, summary) VALUES ('r1', ?, NULL, ?, ?, 'done', 'logs rotated; df shows 40% free')`).run(task.id, now - 60, now)
    insertEvent(env.db, { task_id: task.id, run_id: 'r1', kind: 'tool_call', payload: { tool: 'Bash', input: { command: 'logrotate -f /etc/logrotate.conf' } } })
    insertEvent(env.db, { task_id: task.id, run_id: 'r1', kind: 'tool_call', payload: { tool: 'Edit', input: { file_path: '/etc/logrotate.d/app' } } })
    env.db.prepare(`UPDATE tasks SET status = 'done' WHERE id = ?`).run(task.id)
    const workflow = (await (await call('POST', `/tasks/${task.id}/save-workflow`)).json()) as { name: string; definition: { steps: { id: string; instructions: string }[] } }
    assert.match(workflow.name, /rotate the logs \(from /)
    const work = workflow.definition.steps[0].instructions
    assert.ok(work.includes('logrotate -f /etc/logrotate.conf') && work.includes('/etc/logrotate.d/app') && work.includes('df shows 40% free'))
    assert.deepEqual(workflow.definition.steps.map((s) => s.id), ['do', 'check'])
    const again = (await (await call('POST', `/tasks/${task.id}/save-workflow`)).json()) as { name: string }
    assert.match(again.name, /\(from .*\) 2$/, 'saving again gets a new name')

    env.db.prepare(`UPDATE runs SET bot = 'coder' WHERE id = 'r1'`).run()
    const old = createRoutine(env.db, { bot: 'planner', name: 'Stale report', prompt: 'p', schedule: '0 7 1 1 *', created_by: USER })
    assert.ok(typeof old !== 'string')
    env.db.prepare('UPDATE bot_routines SET created_at = ? WHERE id = ?').run(now - 30 * 86_400, old.id)
    const review = (await (await call('GET', '/review?days=7')).json()) as { prune: { kind: string; ref: string }[]; spot_checks: { task_id: string }[]; bots: { bot: string; tasks_done: number }[] }
    assert.ok(review.prune.some((p) => p.kind === 'routine' && p.ref === String(old.id)), 'a routine that never ran')
    assert.ok(review.prune.some((p) => p.kind === 'bot' && p.ref === 'reviewer'), 'an idle bot')
    assert.ok(!review.prune.some((p) => p.ref === 'taskq'), 'the orchestrator is never a prune candidate')
    assert.equal(review.bots.find((b) => b.bot === 'coder')?.tasks_done, 1)
    assert.deepEqual(review.spot_checks.map((s) => s.task_id), [task.id])
  })

  test('deleting a bot removes its routines and denies its unused approvals', async () => {
    const routine = createRoutine(env.db, { bot: 'coder', name: 'n', prompt: 'p', schedule: '0 7 * * *', created_by: USER })
    assert.ok(typeof routine !== 'string')
    const request = requestApproval(env.db, 'coder', 'Bash', 'git push', 'git push*')
    assert.ok((await call('DELETE', '/bots/coder')).ok)
    assert.equal(env.db.prepare('SELECT count(*) AS n FROM bot_routines WHERE bot = ?').get('coder')?.n, 0)
    assert.equal(env.db.prepare('SELECT status FROM bot_approvals WHERE id = ?').get(request.id)?.status, 'denied')
  })

  test('[critical] a bot the user wrote to answers the user directly; one the user never addressed cannot start a conversation', () => {
    const coder = getAgent(env.db, 'coder')!
    assert.equal(coder.may_message_user, false)
    assert.throws(() => tool('coder', 'send_message').handler({ to: 'user', body: 'unprompted' }), /has not written to you/)
    postMessage(env.db, { sender: USER, recipient: 'coder', body: 'hi' })
    assert.ok(tool('coder', 'send_message').handler({ to: 'user', body: 'hi, what do you need?' }))
    assert.equal(inbox('user').at(-1), 'hi, what do you need?')
    const system = systemFor(coder, listAgents(env.db), env.config, env.home, env.home, env.home)
    assert.match(system, /When the user writes to you .* answer them yourself with send_message to "user"/)
  })
})
