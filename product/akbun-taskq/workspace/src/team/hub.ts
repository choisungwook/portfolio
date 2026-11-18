import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import {
  agentsWithMail, endTurn, getAgent, listAgents, recoverTurns, seedAgents, setAgentSession, spentSince, startTurn, turnsSince,
} from '../db/team.ts'
import { getMeta, setMeta } from '../db/meta.ts'
import { raiseAlert } from '../alerts/rules.ts'
import { nowSec } from '../time.ts'
import { teamChanged } from '../wake.ts'
import { DEFAULT_ROSTER } from './roster.ts'
import { agentDir, promptFor, systemFor } from './prompt.ts'
import { teamTools } from './tools.ts'
import type { TeamBackend, TurnResult } from './types.ts'

export interface HubOptions {
  db: Db
  config: Config
  backend: TeamBackend
}

export interface TeamHub {
  start(): Promise<void>
  stop(): Promise<void>
}

const BATCH = 20
const STOP_GRACE_MS = 3000

export function isTeamPaused(db: Db): boolean {
  return getMeta(db, 'team_paused') === '1'
}

export function teamPauseReason(db: Db): string | null {
  return isTeamPaused(db) ? getMeta(db, 'team_pause_reason') : null
}

export function pauseTeam(db: Db, reason: string): void {
  if (isTeamPaused(db)) return
  setMeta(db, 'team_paused', '1')
  setMeta(db, 'team_pause_reason', reason)
  raiseAlert(db, { task_id: null, kind: 'team_paused', message: `Team paused: ${reason}` })
}

export function resumeTeam(db: Db): void {
  setMeta(db, 'team_paused', '0')
  teamChanged.notify()
}

function localMidnight(): number {
  const now = new Date()
  return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000)
}

// Delivers mail to resident agents. An agent with undelivered messages and no open turn gets one turn that resumes its
// session; the turn sees every message that arrived since its last turn. At most maxConcurrentTurns run at once.
export function createTeamHub({ db, config, backend }: HubOptions): TeamHub {
  const active = new Map<string, { controller: AbortController; done: Promise<void> }>()
  const stopped = new AbortController()
  let running = false

  // Budget and loop guards stop the whole team rather than one agent: a loop involves at least two agents, and the
  // user should see one alert, not one per agent.
  function guardsHold(name: string): boolean {
    const t = config.team
    if (spentSince(db, localMidnight()) >= t.dailyBudgetUsd) {
      pauseTeam(db, `daily budget of $${t.dailyBudgetUsd} is spent`)
      return false
    }
    const recent = turnsSince(db, name, nowSec() - 3600)
    if (recent >= t.hourlyTurnsPerAgent) {
      pauseTeam(db, `${name} took ${recent} turns in the last hour; agents may be messaging each other in a loop`)
      return false
    }
    return true
  }

  function launch(name: string): void {
    const started = startTurn(db, name, BATCH)
    const agent = getAgent(db, name)
    if (!started || !agent) return
    const controller = new AbortController()
    const cwd = agentDir(config, name)
    mkdirSync(cwd, { recursive: true })
    const readRoots = [join(config.home, 'outputs'), ...config.trustedRepos, ...config.team.readRoots]
    const done = backend.runTurn(config, {
      agent,
      system: systemFor(agent, listAgents(db), config, readRoots),
      prompt: promptFor(started.messages),
      tools: teamTools({ db, config, agent: name }),
      cwd,
      readRoots: config.team.personaSkill ? [...readRoots, config.team.personaSkill] : readRoots,
      resume: agent.session_id,
      signal: controller.signal,
    })
      .catch((error: unknown): TurnResult => ({ outcome: 'failed', error: error instanceof Error ? error.message : String(error) }))
      .then((result) => finish(name, started.turn.id, result, controller.signal.aborted))
      .catch((error: unknown) => console.error(`taskq: team turn of ${name} crashed: ${String(error)}`))
      .finally(() => {
        active.delete(name)
        teamChanged.notify()
      })
    active.set(name, { controller, done })
  }

  function finish(name: string, turnId: number, result: TurnResult, aborted: boolean): void {
    if (result.session_id) setAgentSession(db, name, result.session_id)
    if (result.session_missing) setAgentSession(db, name, null)
    const outcome = aborted ? 'interrupted' : result.outcome
    const setAside = endTurn(db, turnId, {
      outcome, error: result.error, turns: result.turns, cost_usd: result.cost_usd, session_id: result.session_id,
    }, config.team.maxAttempts)
    if (result.auth_failed) pauseTeam(db, `model provider login failed for ${name}`)
    for (const message of setAside) {
      raiseAlert(db, {
        task_id: message.task_id, kind: 'team_message',
        message: `Message #${message.id} from ${message.sender} to ${name} was set aside after ${config.team.maxAttempts} failed turns: ${result.error ?? 'unknown error'}`,
      })
    }
  }

  function tick(): void {
    if (isTeamPaused(db)) return
    for (const name of agentsWithMail(db)) {
      if (active.size >= config.team.maxConcurrentTurns) return
      if (active.has(name)) continue
      if (!guardsHold(name)) return
      launch(name)
    }
  }

  async function loop(seen: number): Promise<void> {
    while (running) {
      await teamChanged.wait(config.pollSec * 1000, stopped.signal, seen)
      if (!running) return
      seen = teamChanged.version()
      try {
        tick()
      } catch (error) {
        console.error(`taskq: team tick failed: ${String(error)}`)
      }
    }
  }

  return {
    async start() {
      seedAgents(db, DEFAULT_ROSTER)
      recoverTurns(db)
      running = true
      const seen = teamChanged.version()
      tick()
      void loop(seen)
    },
    async stop() {
      running = false
      stopped.abort()
      const turns = [...active.values()]
      for (const turn of turns) turn.controller.abort()
      await Promise.race([
        Promise.allSettled(turns.map((turn) => turn.done)),
        new Promise((resolve) => setTimeout(resolve, STOP_GRACE_MS)),
      ])
    },
  }
}
