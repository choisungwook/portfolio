import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { USER, getAgent, listMessages, listTurns, postMessage, seedAgents, setAgentSession, updateAgent } from '../src/db/team.ts'
import { createTeamHub, isTeamPaused, resumeTeam, type TeamHub } from '../src/team/hub.ts'
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

  test('[critical] a request the provider refused is not retried and costs nothing', async () => {
    const { db, config } = env
    const { backend, requests } = fakeBackend(() => ({ outcome: 'failed', error: '400 unsupported', cost_usd: 0, rejected: true }))
    hub = createTeamHub({ db, config, backend, retryAfterSec: 0 })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'coder', body: 'do it' })
    teamChanged.notify()
    await waitFor(() => listTurns(db, 5).some((t) => t.ended_at !== null))
    await sleep(30)
    assert.equal(requests.length, 1)
    assert.equal(listTurns(db, 5)[0].cost_usd, 0)
  })

  test('[critical] a conversation over the token limit is handed over: the bot is asked for a note, then starts a new session', async () => {
    const { db, config } = env
    let n = 0
    const { backend, requests } = fakeBackend((request, call) => {
      n += 1
      if (request.prompt.includes('call write_handover')) call('write_handover', { text: 'step 2 of the migration is next' })
      // Every turn ends over the limit: the first turn of a session is never asked, so the new session does not loop.
      return { outcome: 'done', session_id: `s${n}`, context: { tokens: 150_000, window: null } }
    })
    hub = createTeamHub({ db, config, backend, retryAfterSec: 0 })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'coder', body: 'a long job' })
    teamChanged.notify()
    await waitFor(() => requests.length === 1)
    await sleep(30)
    assert.equal(requests.length, 1, 'the first turn of a session is not asked')
    postMessage(db, { sender: USER, recipient: 'coder', body: 'more' })
    teamChanged.notify()
    await waitFor(() => requests.length === 4)
    await sleep(30)
    assert.equal(requests.length, 4, 'one handover, not a loop')
    assert.match(requests[2].prompt, /call write_handover/)
    assert.equal(requests[2].resume, 's2', 'the bot writes the note in the session that holds the conversation')
    assert.equal(requests[3].resume, null, 'the next turn starts an empty session')
    assert.match(requests[3].prompt, /step 2 of the migration/, 'and its first message is the note')
    assert.equal(requests[0].sessionMaxTokens, 100_000)
  })

  test('[critical] a handover asked in a session that is gone is withdrawn, and the next turn over the limit is asked afresh', async () => {
    const { db, config } = env
    let n = 0
    const { backend, requests } = fakeBackend(() => {
      n += 1
      return { outcome: 'done', session_id: `s${n}`, context: { tokens: 150_000, window: null } }
    })
    hub = createTeamHub({ db, config, backend, retryAfterSec: 0 })
    db.prepare("UPDATE team_agents SET session_id = 's0' WHERE name = 'coder'").run()
    db.prepare("INSERT INTO meta (key, value) VALUES ('team_handover_note:coder', 'an old note')").run()
    // A request left by a session that is gone: its message is still unread.
    const stale = postMessage(db, { sender: 'queue', recipient: 'coder', body: 'call write_handover' })
    db.prepare("INSERT INTO meta (key, value) VALUES ('team_handover:coder', ?)").run(`${stale}:gone`)
    postMessage(db, { sender: USER, recipient: 'coder', body: 'do X' })
    await hub.start()
    teamChanged.notify()
    await waitFor(() => requests.length === 2)
    assert.doesNotMatch(requests[0].prompt, /write_handover/, 'the stale request is not delivered')
    assert.equal(requests[0].resume, 's0', 'and the session is kept')
    assert.match(requests[1].prompt, /call write_handover/, 'the turn over the limit is asked afresh')
    assert.equal(db.prepare("SELECT 1 FROM meta WHERE key = 'team_handover_note:coder'").get(), undefined, 'an old note is not carried into a new handover')
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

  test('[critical] a lost OpenAI or Kiro login turns off only that bot; the team keeps working', async () => {
    const { db, config } = env
    updateAgent(db, 'coder', { ...getAgent(db, 'coder')!, sdk: 'kiro' })
    const kiro: TeamBackend = { sdk: 'kiro', async runTurn() { return { outcome: 'failed', auth_failed: true, error: 'login', cost_usd: 0 } } }
    hub = createTeamHub({ db, config, backend: fakeBackend(() => ({ outcome: 'done', cost_usd: 0 })).backend, backends: { kiro }, retryAfterSec: 0 })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'coder', body: 'hi' })
    teamChanged.notify()
    await waitFor(() => getAgent(db, 'coder')?.enabled === false)
    assert.equal(isTeamPaused(db), false)
    const alert = db.prepare(`SELECT message FROM alerts WHERE kind = 'auth_required'`).get() as { message: string } | undefined
    assert.match(alert?.message ?? '', /coder was turned off: its Kiro login failed/)
    assert.equal(db.prepare('SELECT sdk FROM team_turns ORDER BY id DESC LIMIT 1').get()?.sdk, 'kiro', 'the turn keeps the runtime it started on')
  })

  test('[critical] a new SDK or provider starts a new session; the reset clears the context and the session cost', async () => {
    const { db } = env
    setAgentSession(db, 'coder', 'claude-session')
    db.prepare(`UPDATE team_agents SET context_tokens = 5000, context_window = 200000, session_cost_usd = 2 WHERE name = 'coder'`).run()
    updateAgent(db, 'coder', { ...getAgent(db, 'coder')!, role: 'renamed' })
    assert.equal(getAgent(db, 'coder')?.session_id, 'claude-session', 'other edits keep the session')
    updateAgent(db, 'coder', { ...getAgent(db, 'coder')!, sdk: 'openai', provider: 'api' })
    const moved = db.prepare(`SELECT session_id, context_tokens, context_window FROM team_agents WHERE name = 'coder'`).get()
    assert.deepEqual({ ...moved }, { session_id: null, context_tokens: null, context_window: null })
    setAgentSession(db, 'coder', 'resp_1')
    updateAgent(db, 'coder', { ...getAgent(db, 'coder')!, provider: 'bedrock' })
    assert.equal(getAgent(db, 'coder')?.session_id, null, 'a Responses id is not a Bedrock session')
    setAgentSession(db, 'coder', 'local:coder:1')
    db.prepare(`UPDATE team_agents SET context_tokens = 900, session_cost_usd = 1 WHERE name = 'coder'`).run()
    const res = await createApp({ db, config: env.config }, TOKEN).request('/api/bots/coder/reset', {
      method: 'POST', headers: { 'x-taskq-token': TOKEN, 'content-type': 'application/json', host: `127.0.0.1:${env.config.port}` }, body: '{}',
    })
    assert.equal(res.status, 200)
    const reset = db.prepare(`SELECT session_id, context_tokens, session_cost_usd FROM team_agents WHERE name = 'coder'`).get()
    assert.deepEqual({ ...reset }, { session_id: null, context_tokens: null, session_cost_usd: 0 })
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
