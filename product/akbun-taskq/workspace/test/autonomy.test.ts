import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/api/server.ts'
import { agentsWithMail, getAgent, listAgents, listMessages, postMessage, USER } from '../src/db/team.ts'
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
    const bypass = { ...coder, permission_mode: 'bypassPermissions' as const }
    assert.equal(botGate(env.config, bypass, env.home, 'Bash', push, broker('coder')).action, 'allow', 'bypass skips the built-in list')
    const own = { ...bypass, ask_first: ['git commit*', 'tool:mcp__gmail__send*'] }
    assert.equal(botGate(env.config, own, env.home, 'Bash', { command: 'git commit -m x' }, broker('coder')).action, 'deny', 'but not the bot\'s own rules')
    assert.equal(botGate(env.config, own, env.home, 'mcp__gmail__send_mail', { to: 'a' }, broker('coder')).action, 'deny')
    assert.equal(botGate(env.config, own, env.home, 'mcp__gmail__read', {}, broker('coder')).action, 'allow')
  })

  test('[critical] a bot at a login wall gets no turns until the user signs in, then continues', async () => {
    postMessage(env.db, { sender: USER, recipient: 'coder', body: 'check the bucket' })
    assert.ok(agentsWithMail(env.db, nowSec(), 0).includes('coder'))
    const made = tool('coder', 'request_login').handler({ what: 'AWS SSO for the prod account', how: 'aws sso login --profile prod' }) as { request: number }
    assert.ok(!agentsWithMail(env.db, nowSec(), 0).includes('coder'), 'waiting for the login')
    const login = env.db.prepare(`SELECT ref FROM alerts WHERE kind = 'auth_required'`).get()
    assert.equal(login?.ref, `bot-login:${made.request}`)
    assert.equal((await call('POST', `/bot-logins/${made.request}`, { signed_in: true })).status, 200)
    assert.ok(agentsWithMail(env.db, nowSec(), 0).includes('coder'))
    assert.match(inbox('coder').at(-1) ?? '', /signed in \(AWS SSO for the prod account\)\. Continue/)
  })

  test('[critical] routines: cron in local time, due runs delivered once and tagged, triggers on new failures, webhooks', async () => {
    const saturday = Math.floor(new Date(2026, 10, 21, 12, 0).getTime() / 1000)
    assert.equal(nextRun('0 7 * * 1-5', saturday), Math.floor(new Date(2026, 10, 23, 7, 0).getTime() / 1000), 'next weekday 7am is Monday')
    assert.equal(nextRun('*/15 * * * *', Math.floor(new Date(2026, 10, 21, 12, 7).getTime() / 1000)), Math.floor(new Date(2026, 10, 21, 12, 15).getTime() / 1000))
    assert.equal(typeof createRoutine(env.db, { bot: 'coder', name: 'x', prompt: 'y', schedule: '61 * * * *', created_by: USER }), 'string')

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

  test('[critical] a task that needs a second check waits for a reviewer bot; the owner cannot approve it', async () => {
    const created = tool('coder', 'create_task').handler({ type: 'research', intent: 'measure the export time', review_required: true }) as { task_id: string }
    assert.ok(startBotTask(env.db, 'coder', created.task_id, null).ok)
    assert.ok(finishBotTask(env.db, 'coder', created.task_id, 'done', 'it takes 4 min (ran time ./export)').ok)
    const status = () => env.db.prepare('SELECT status, json_extract(data, \'$.reviewer\') AS reviewer FROM tasks WHERE id = ?').get(created.task_id)
    assert.deepEqual({ ...status() }, { status: 'review', reviewer: 'reviewer' })
    assert.match(inbox('reviewer').at(-1) ?? '', /Please review task .* by coder/)
    assert.throws(() => tool('coder', 'review_task').handler({ task_id: created.task_id, verdict: 'approve', note: 'mine' }), /own task/)
    tool('reviewer', 'review_task').handler({ task_id: created.task_id, verdict: 'reject', note: 'no timing output in the summary' })
    assert.equal(status()?.status, 'ready')
    assert.match(inbox('coder').at(-1) ?? '', /rejected task .*no timing output/)
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
})
