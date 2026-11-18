import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import {
  agentsWithMail, endTurn, getAgent, listAgents, nextDelivery, recoverTurns, replaceAgentSession, seedAgents, spentSince,
  startTurn, turnsSince, type TeamMessage, type TurnEnd,
} from '../db/team.ts'
import { closeUnconcluded, passStalled, skipDisabledSpeakers } from '../db/threads.ts'
import { getMeta, setMeta } from '../db/meta.ts'
import { raiseAlert } from '../alerts/rules.ts'
import { nowSec } from '../time.ts'
import { teamChanged } from '../wake.ts'
import { DEFAULT_ROSTER } from './roster.ts'
import { agentDir, promptFor, systemFor } from './prompt.ts'
import { hybridSearch } from './search.ts'
import { teamTools } from './tools.ts'
import { wikiDir } from './wiki-files.ts'
import type { TeamBackend, TurnResult } from './types.ts'

export interface HubOptions {
  db: Db
  config: Config
  backend: TeamBackend
  retryAfterSec?: number
}

export interface TeamHub {
  start(): Promise<void>
  stop(): Promise<void>
}

const BATCH = 20                // messages handed to one turn; the rest wait for the next turn
const STOP_GRACE_MS = 3000      // same grace the task runner gives its runs on shutdown
const RETRY_AFTER_SEC = 60      // wait after a failed turn, so an outage does not use up every attempt at once

export function isTeamPaused(db: Db): boolean {
  return getMeta(db, 'team_paused') === '1'
}

export function teamPauseReason(db: Db): string | null {
  return isTeamPaused(db) ? getMeta(db, 'team_pause_reason') : null
}

export function pauseTeam(db: Db, reason: string, kind: 'team_paused' | 'security_finding' = 'team_paused'): void {
  if (isTeamPaused(db)) return
  setMeta(db, 'team_paused', '1')
  setMeta(db, 'team_pause_reason', reason)
  raiseAlert(db, { task_id: null, kind, message: `Bots paused: ${reason}` })
}

// Resuming is the user's decision to accept what tripped the guard, so the budget and loop windows restart from now.
// Without that, a resumed team would pause again on its next turn for the same reason.
export function resumeTeam(db: Db): void {
  setMeta(db, 'team_paused', '0')
  setMeta(db, 'team_resumed_at', String(nowSec()))
  teamChanged.notify()
}

function resumedAt(db: Db): number {
  return Number(getMeta(db, 'team_resumed_at') ?? 0)
}

function localMidnight(): number {
  const now = new Date()
  return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000)
}

// Delivers mail to resident agents. An agent with deliverable messages and no open turn gets one turn that resumes its
// session; the turn sees every message that arrived since its last turn. At most maxConcurrentTurns run at once.
export function createTeamHub({ db, config, backend, retryAfterSec = RETRY_AFTER_SEC }: HubOptions): TeamHub {
  const active = new Map<string, { controller: AbortController; done: Promise<void> }>()
  const stopped = new AbortController()
  const search = hybridSearch(db)
  let running = false

  // Budget and loop guards stop the whole team rather than one agent: a loop involves at least two agents, and the
  // user should see one alert, not one per agent. Each running turn reserves its full per-turn budget, so turns
  // started together cannot overshoot the daily limit by more than what a single turn may spend.
  function guardsHold(name: string): boolean {
    const t = config.bots
    const since = Math.max(localMidnight(), resumedAt(db))
    const committed = spentSince(db, since) + active.size * t.turnBudgetUsd
    if (committed + t.turnBudgetUsd > t.dailyBudgetUsd) {
      if (active.size === 0) pauseTeam(db, `daily budget of $${t.dailyBudgetUsd} is spent ($${spentSince(db, since).toFixed(2)} on turns and owned tasks)`)
      return false
    }
    const recent = turnsSince(db, name, Math.max(nowSec() - 3600, resumedAt(db)))
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
    const wiki = wikiDir(config)
    mkdirSync(wiki, { recursive: true })
    const readRoots = [join(config.home, 'outputs'), wiki, ...config.trustedRepos, ...config.bots.readRoots]
    const done = backend.runTurn(config, {
      agent,
      system: systemFor(agent, listAgents(db), config, readRoots, wiki),
      prompt: promptFor(db, started.messages),
      tools: teamTools({ db, config, agent: name, search, turnId: started.turn.id }),
      cwd,
      readRoots: config.bots.personaSkill ? [...readRoots, config.bots.personaSkill] : readRoots,
      resume: agent.session_id,
      signal: controller.signal,
    })
      .catch((error: unknown): TurnResult => ({ outcome: 'failed', error: error instanceof Error ? error.message : String(error) }))
      .then((result) => finish(name, started.turn.id, agent.session_id, started.messages, result, controller.signal.aborted))
      .catch((error: unknown) => console.error(`taskq: team turn of ${name} crashed: ${String(error)}`))
      .finally(() => {
        active.delete(name)
        teamChanged.notify()
      })
    active.set(name, { controller, done })
  }

  function finish(name: string, turnId: number, session: string | null, messages: TeamMessage[], result: TurnResult, aborted: boolean): void {
    if (result.session_missing) replaceAgentSession(db, name, session, null)
    else if (result.session_id) replaceAgentSession(db, name, session, result.session_id)
    const outcome = aborted ? 'interrupted' : result.outcome
    // A turn that ended without a cost figure (abort, crash) is charged its whole budget rather than nothing.
    const cost = result.cost_usd ?? (outcome === 'done' ? 0 : config.bots.turnBudgetUsd)
    const end = endTurn(db, turnId, {
      outcome, error: result.error, turns: result.turns, cost_usd: cost, session_id: result.session_id,
    }, config.bots.maxAttempts)
    reportSetAside(name, end, result.error)
    if (result.tampered) pauseTeam(db, `${name} tried to reach taskq itself: ${result.tampered}`, 'security_finding')
    if (result.auth_failed) pauseTeam(db, `model provider login failed for ${name}`)
    // Only a turn that ran to its end counts as choosing not to speak. A failed turn (provider outage) keeps the floor,
    // and its messages come back for the retry.
    if (outcome === 'done') {
      const threads = messages.map((m) => m.thread_id).filter((id): id is number => id !== null)
      passStalled(db, name, threads)
      for (const id of closeUnconcluded(db, name, messages)) {
        raiseAlert(db, { task_id: null, kind: 'team_message', message: `Discussion #${id} was closed without a conclusion: its moderator ${name} ended a turn without concluding it.` })
      }
    }
  }

  function reportSetAside(name: string, end: TurnEnd, error: string | undefined): void {
    if (end.setAside.length === 0) return
    const ids = end.setAside.map((m) => `#${m.id}`).join(', ')
    const why = end.reason === 'writes'
      ? 'the turn failed after it had already sent messages or created tasks, so it is not retried (a retry would repeat them)'
      : `${config.bots.maxAttempts} turns failed on them`
    raiseAlert(db, {
      task_id: end.setAside[0].task_id, kind: 'team_message',
      message: `Messages ${ids} to ${name} were set aside: ${why}. Last error: ${error ?? 'interrupted'}. Check taskq bots log and resend if needed.`,
    })
  }

  function tick(): void {
    if (isTeamPaused(db)) return
    for (const id of skipDisabledSpeakers(db).closed) {
      raiseAlert(db, { task_id: null, kind: 'team_message', message: `Discussion #${id} was closed without a conclusion: its moderator is disabled.` })
    }
    for (const name of agentsWithMail(db, nowSec(), retryAfterSec)) {
      if (active.size >= config.bots.maxConcurrentTurns) return
      if (active.has(name)) continue
      if (!guardsHold(name)) return
      launch(name)
    }
  }

  // Wakes on an in-process change, at the next scheduled delivery, or every pollSec for writes from the CLI.
  async function loop(seen: number): Promise<void> {
    while (running) {
      const now = nowSec()
      const due = nextDelivery(db, now)
      const untilDue = due === undefined ? Infinity : (due - now) * 1000
      await teamChanged.wait(Math.min(config.pollSec * 1000, untilDue + 50), stopped.signal, seen)
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
      for (const { agent, end } of recoverTurns(db)) reportSetAside(agent, end, 'taskq stopped during the turn')
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
