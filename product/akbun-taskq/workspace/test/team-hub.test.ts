import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { USER, getAgent, listMessages, listTurns, postMessage, seedAgents } from '../src/db/team.ts'
import { createTeamHub, isTeamPaused, resumeTeam, teamPauseReason, type TeamHub } from '../src/team/hub.ts'
import type { TeamBackend, TurnRequest, TurnResult } from '../src/team/types.ts'
import { teamChanged } from '../src/wake.ts'
import { seedTestBots, setup, sleep, waitFor, TOKEN, type TestEnv } from './helpers.ts'
import { createApp } from '../src/api/server.ts'

type Script = (request: TurnRequest, call: (name: string, args: Record<string, unknown>) => Record<string, unknown>) => Promise<TurnResult> | TurnResult

function fakeBackend(script: Script): { backend: TeamBackend; requests: TurnRequest[] } {
  const requests: TurnRequest[] = []
  const backend: TeamBackend = {
    async runTurn(_config, request) {
      requests.push(request)
      const call = (name: string, args: Record<string, unknown>) => request.tools.find((t) => t.name === name)!.handler(args)
      return script(request, call)
    },
  }
  return { backend, requests }
}

describe('team hub', () => {
  let env: TestEnv
  let hub: TeamHub | undefined
  test.beforeEach(async () => {
    env = setup()
    await seedTestBots(env.db)
  })
  test.afterEach(async () => {
    await hub?.stop()
    hub = undefined
    env.cleanup()
  })

  test('a user message wakes taskq, taskq delegates, and the planner answers in its own turn', async () => {
    const { db, config } = env
    const { backend, requests } = fakeBackend((request, call) => {
      if (request.agent.name === 'taskq' && request.prompt.includes('from="user"')) call('send_message', { to: 'planner', body: 'schedule a survey' })
      if (request.agent.name === 'planner') call('send_message', { to: 'taskq', body: 'scheduled' })
      if (request.agent.name === 'taskq' && request.prompt.includes('from="planner"')) call('send_message', { to: USER, body: 'survey scheduled' })
      return { outcome: 'done', session_id: `sess-${request.agent.name}`, cost_usd: 0.01, turns: 1 }
    })
    hub = createTeamHub({ db, config, backend, retryAfterSec: 0 })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'please survey X' })
    teamChanged.notify()
    await waitFor(() => listMessages(db, { recipient: USER, limit: 5 }).length === 1)
    assert.deepEqual(requests.map((r) => r.agent.name), ['taskq', 'planner', 'taskq'])
    assert.equal(requests[0].resume, null)
    assert.equal(requests[2].resume, 'sess-taskq')
    assert.equal(getAgent(db, 'planner')?.session_id, 'sess-planner')
    assert.match(requests[1].system, /You are "planner"/)
    assert.match(requests[1].system, /- taskq \(orchestrator\)/)
  })

  test('[critical] a message to a working bot joins its running turn instead of waiting for the next one', async () => {
    const { db, config } = env
    let release: () => void = () => {}
    const pushed: string[] = []
    const backend: TeamBackend = {
      supportsLiveInput: true,
      async runTurn(_config, request) {
        const original = request.live!.push.bind(request.live!)
        request.live!.push = (text: string) => { pushed.push(text); return original(text) }
        await new Promise<void>((resolve) => { release = resolve })
        return { outcome: 'done', session_id: 'sess-taskq', cost_usd: 0.01, turns: 1 }
      },
    }
    hub = createTeamHub({ db, config, backend, retryAfterSec: 0 })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'first' })
    teamChanged.notify()
    await waitFor(() => hub!.busy().includes('taskq'))
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'second while working' })
    teamChanged.notify()
    await waitFor(() => pushed.length === 1)
    assert.match(pushed[0], /second while working/)
    release()
    await waitFor(() => hub!.busy().length === 0)
    const turns = listTurns(db, 5)
    assert.equal(turns.length, 1)
    assert.equal(db.prepare('SELECT count(*) AS n FROM team_messages WHERE recipient = ? AND turn_id = ?').get('taskq', turns[0].id)?.n, 2)
  })

  test('[critical] a cancel from the CLI or MCP server (another process) stops the running turn', async () => {
    const { db, config } = env
    const backend: TeamBackend = {
      runTurn: (_config, request) => new Promise((resolve) => {
        request.signal.addEventListener('abort', () => resolve({ outcome: 'failed', error: 'aborted' }))
      }),
    }
    hub = createTeamHub({ db, config, backend, retryAfterSec: 0 })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'long job' })
    teamChanged.notify()
    await waitFor(() => hub!.busy().includes('taskq'))
    const app = createApp({ db, config }, TOKEN)
    const res = await app.request('/api/bots/taskq/cancel', { method: 'POST', headers: { 'x-taskq-token': TOKEN, host: `127.0.0.1:${config.port}`, 'content-type': 'application/json' }, body: '{}' })
    assert.deepEqual(await res.json(), { ok: true, requested: true })
    await waitFor(() => listTurns(db, 5)[0]?.outcome === 'cancelled')
  })

  test('[critical] a Claude turn costs the difference of the session running total, not the total', async () => {
    const { db, config } = env
    const totals = [0.5, 0.8]
    const { backend } = fakeBackend(() => ({ outcome: 'done', session_id: 'sess-t', session_total_usd: totals.shift(), turns: 1 }))
    hub = createTeamHub({ db, config, backend, retryAfterSec: 0 })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'one' })
    teamChanged.notify()
    await waitFor(() => listTurns(db, 5).filter((t) => t.ended_at !== null).length === 1)
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'two' })
    teamChanged.notify()
    await waitFor(() => listTurns(db, 5).filter((t) => t.ended_at !== null).length === 2)
    const costs = listTurns(db, 5).map((t) => Math.round((t.cost_usd ?? 0) * 100) / 100).sort()
    assert.deepEqual(costs, [0.3, 0.5])
  })

  test('the team pauses when the daily budget is spent', async () => {
    const { db, config } = env
    config.bots.dailyBudgetUsd = 0.1
    config.bots.turnBudgetUsd = 0.05
    const { backend, requests } = fakeBackend(() => ({ outcome: 'done', cost_usd: 0.06 }))
    hub = createTeamHub({ db, config, backend, retryAfterSec: 0 })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'one' })
    teamChanged.notify()
    await waitFor(() => listTurns(db, 5).some((t) => t.ended_at !== null))
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'two' })
    teamChanged.notify()
    await waitFor(() => isTeamPaused(db))
    assert.equal(requests.length, 1)
    assert.match(teamPauseReason(db) ?? '', /daily budget/)
  })

  test('two agents messaging each other in a loop pause the team', async () => {
    const { db, config } = env
    config.bots.hourlyTurnsPerAgent = 3
    const { backend } = fakeBackend((request, call) => {
      call('send_message', { to: request.agent.name === 'taskq' ? 'planner' : 'taskq', body: 'your turn' })
      return { outcome: 'done', cost_usd: 0 }
    })
    hub = createTeamHub({ db, config, backend, retryAfterSec: 0 })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'go' })
    teamChanged.notify()
    await waitFor(() => isTeamPaused(db))
    assert.match(teamPauseReason(db) ?? '', /loop/)
    const turns = listTurns(db, 50).length
    await sleep(50)
    assert.equal(listTurns(db, 50).length, turns)
  })

  test('a message is retried after a failed turn and set aside after maxAttempts', async () => {
    const { db, config } = env
    config.bots.maxAttempts = 2
    const { backend, requests } = fakeBackend(() => ({ outcome: 'failed', error: 'model error' }))
    hub = createTeamHub({ db, config, backend, retryAfterSec: 0 })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'coder', body: 'do it' })
    teamChanged.notify()
    await waitFor(() => listTurns(db, 5).filter((t) => t.ended_at !== null).length === 2)
    await sleep(30)
    assert.equal(requests.length, 2)
  })

  test('a missing session is dropped so the next turn starts a new one', async () => {
    const { db, config } = env
    let first = true
    const { backend, requests } = fakeBackend(() => {
      if (first) {
        first = false
        return { outcome: 'failed', error: 'No conversation found', session_missing: true }
      }
      return { outcome: 'done', session_id: 'fresh' }
    })
    db.prepare("UPDATE team_agents SET session_id = 'gone' WHERE name = 'taskq'").run()
    hub = createTeamHub({ db, config, backend, retryAfterSec: 0 })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'hi' })
    teamChanged.notify()
    await waitFor(() => getAgent(db, 'taskq')?.session_id === 'fresh')
    assert.deepEqual(requests.map((r) => r.resume), ['gone', null])
  })

  test('a login failure pauses the team until the user resumes it', async () => {
    const { db, config } = env
    const { backend } = fakeBackend(() => ({ outcome: 'failed', auth_failed: true, error: 'login' }))
    hub = createTeamHub({ db, config, backend, retryAfterSec: 0 })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'hi' })
    teamChanged.notify()
    await waitFor(() => isTeamPaused(db))
    resumeTeam(db)
    assert.equal(isTeamPaused(db), false)
  })
})
