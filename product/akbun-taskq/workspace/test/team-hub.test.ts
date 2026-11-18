import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { USER, getAgent, listMessages, listTurns, postMessage, seedAgents } from '../src/db/team.ts'
import { DEFAULT_ROSTER } from '../src/team/roster.ts'
import { createTeamHub, isTeamPaused, resumeTeam, teamPauseReason, type TeamHub } from '../src/team/hub.ts'
import type { TeamBackend, TurnRequest, TurnResult } from '../src/team/types.ts'
import { teamChanged } from '../src/wake.ts'
import { setup, sleep, waitFor, type TestEnv } from './helpers.ts'

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
  test.beforeEach(() => {
    env = setup()
    seedAgents(env.db, DEFAULT_ROSTER)
  })
  test.afterEach(async () => {
    await hub?.stop()
    hub = undefined
    env.cleanup()
  })

  test('a user message wakes the lead, the lead delegates, and the planner answers in its own turn', async () => {
    const { db, config } = env
    const { backend, requests } = fakeBackend((request, call) => {
      if (request.agent.name === 'lead' && request.prompt.includes('from="user"')) call('send_message', { to: 'planner', body: 'schedule a survey' })
      if (request.agent.name === 'planner') call('send_message', { to: 'lead', body: 'scheduled' })
      if (request.agent.name === 'lead' && request.prompt.includes('from="planner"')) call('send_message', { to: USER, body: 'survey scheduled' })
      return { outcome: 'done', session_id: `sess-${request.agent.name}`, cost_usd: 0.01, turns: 1 }
    })
    hub = createTeamHub({ db, config, backend })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'lead', body: 'please survey X' })
    teamChanged.notify()
    await waitFor(() => listMessages(db, { recipient: USER, limit: 5 }).length === 1)
    assert.deepEqual(requests.map((r) => r.agent.name), ['lead', 'planner', 'lead'])
    assert.equal(requests[0].resume, null)
    assert.equal(requests[2].resume, 'sess-lead')
    assert.equal(getAgent(db, 'planner')?.session_id, 'sess-planner')
    assert.match(requests[1].system, /You are "planner"/)
    assert.match(requests[1].system, /- lead \(lead\)/)
  })

  test('the team pauses when the daily budget is spent', async () => {
    const { db, config } = env
    config.team.dailyBudgetUsd = 0.05
    const { backend, requests } = fakeBackend(() => ({ outcome: 'done', cost_usd: 0.05 }))
    hub = createTeamHub({ db, config, backend })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'lead', body: 'one' })
    teamChanged.notify()
    await waitFor(() => listTurns(db, 5).some((t) => t.ended_at !== null))
    postMessage(db, { sender: USER, recipient: 'lead', body: 'two' })
    teamChanged.notify()
    await waitFor(() => isTeamPaused(db))
    assert.equal(requests.length, 1)
    assert.match(teamPauseReason(db) ?? '', /daily budget/)
  })

  test('two agents messaging each other in a loop pause the team', async () => {
    const { db, config } = env
    config.team.hourlyTurnsPerAgent = 3
    const { backend } = fakeBackend((request, call) => {
      call('send_message', { to: request.agent.name === 'lead' ? 'planner' : 'lead', body: 'your turn' })
      return { outcome: 'done', cost_usd: 0 }
    })
    hub = createTeamHub({ db, config, backend })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'lead', body: 'go' })
    teamChanged.notify()
    await waitFor(() => isTeamPaused(db))
    assert.match(teamPauseReason(db) ?? '', /loop/)
    const turns = listTurns(db, 50).length
    await sleep(50)
    assert.equal(listTurns(db, 50).length, turns)
  })

  test('a message is retried after a failed turn and set aside after maxAttempts', async () => {
    const { db, config } = env
    config.team.maxAttempts = 2
    const { backend, requests } = fakeBackend(() => ({ outcome: 'failed', error: 'model error' }))
    hub = createTeamHub({ db, config, backend })
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
    db.prepare("UPDATE team_agents SET session_id = 'gone' WHERE name = 'lead'").run()
    hub = createTeamHub({ db, config, backend })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'lead', body: 'hi' })
    teamChanged.notify()
    await waitFor(() => getAgent(db, 'lead')?.session_id === 'fresh')
    assert.deepEqual(requests.map((r) => r.resume), ['gone', null])
  })

  test('a login failure pauses the team until the user resumes it', async () => {
    const { db, config } = env
    const { backend } = fakeBackend(() => ({ outcome: 'failed', auth_failed: true, error: 'login' }))
    hub = createTeamHub({ db, config, backend })
    await hub.start()
    postMessage(db, { sender: USER, recipient: 'lead', body: 'hi' })
    teamChanged.notify()
    await waitFor(() => isTeamPaused(db))
    resumeTeam(db)
    assert.equal(isTeamPaused(db), false)
  })
})
