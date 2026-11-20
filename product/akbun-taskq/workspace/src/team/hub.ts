import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import {
  SYSTEM, agentsWithMail, endTurn, getAgent, joinTurn, leaveTurn, postMessage, listAgents, nextDelivery, recoverTurns, replaceAgentSession, resetAgentSession, seedAgents, setAgentEnabled,
  startTurn, turnsSince, type BotSdk, type TeamMessage, type TurnEnd,
} from '../db/team.ts'
import { closeUnconcluded, passStalled, skipDisabledSpeakers } from '../db/threads.ts'
import { getMeta, setMeta } from '../db/meta.ts'
import { limits } from '../db/settings.ts'
import { raiseAlert } from '../alerts/rules.ts'
import { consumeApproval, requestApproval } from '../db/bot-requests.ts'
import { applyConnectionSettings } from './connection-settings.ts'
import { runDueRoutines, runTriggeredRoutines, nextRoutineAt } from '../db/routines.ts'
import { nowSec } from '../time.ts'
import { teamChanged } from '../wake.ts'
import { ROSTER } from './roster.ts'
import { agentDir, promptFor, systemFor } from './prompt.ts'
import { hybridSearch } from './search.ts'
import { teamTools } from './tools.ts'
import { wikiDir } from './wiki-files.ts'
import { pluginPaths, skillsFor } from './bot-plugin.ts'
import { mcpServersFor } from '../db/mcp-registry.ts'
import { recoverBotTasks, releaseBotTasks } from './bot-work.ts'
import { botWorkdir, sharedDir } from './shared.ts'
import { LiveInput } from './live-input.ts'
import type { TeamBackend, TurnResult } from './types.ts'
import { createCatalog, type CatalogFn } from './catalog.ts'
import { recordUsage } from '../db/usage.ts'

export interface HubOptions {
  db: Db
  config: Config
  backend: TeamBackend                              // runs Claude bots
  backends?: Partial<Record<BotSdk, TeamBackend>>   // other SDKs; a bot whose SDK has no backend fails its turn
  retryAfterSec?: number
}

export interface TeamHub {
  start(): Promise<void>
  stop(): Promise<void>
  cancel(name: string): boolean   // false when the bot has no turn running
  busy(): string[]
  catalog: CatalogFn
}

const BATCH = 20                // messages handed to one turn; the rest wait for the next turn
const STOP_GRACE_MS = 3000      // same grace the task runner gives its runs on shutdown
const RETRY_AFTER_SEC = 60      // wait after a failed turn, so an outage does not use up every attempt at once
// Messages sent into a running turn. Past this the turn is left to end, and the rest start a new turn that goes through
// the loop guards again; otherwise two bots answering each other could keep one turn open forever.
const MAX_JOINS = 10

interface ActiveTurn {
  controller: AbortController
  done: Promise<void>
  turnId: number
  live: LiveInput | undefined
  messages: TeamMessage[]
  joins: number
}

// Set on a bot the hub turned off for a failed login, so a passing recheck can turn it on again (connections.ts).
export const signedOutKey = (name: string) => `team_signed_out:${name}`
export const LOGIN_FAILED = 'model provider login failed'

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

// Resuming is the user's decision to accept what tripped the guard, so the loop windows restart from now.
// Without that, a resumed team would pause again on its next turn for the same reason.
export function resumeTeam(db: Db): void {
  setMeta(db, 'team_paused', '0')
  setMeta(db, 'team_resumed_at', String(nowSec()))
  teamChanged.notify()
}

// A cancel asked from another process (CLI, MCP server). The hub that runs the turn checks it on every tick.
const cancelKey = (name: string) => `bot_cancel:${name}`
export function requestBotCancel(db: Db, name: string, turnId: number): void {
  setMeta(db, cancelKey(name), String(turnId))
  teamChanged.notify()
}

function resumedAt(db: Db): number {
  return Number(getMeta(db, 'team_resumed_at') ?? 0)
}

// Delivers mail to resident agents. An agent with deliverable messages and no open turn gets one turn that resumes its
// session; the turn sees every message that arrived since its last turn. At most maxConcurrentTurns run at once.
export function createTeamHub({ db, config, backend: claude, backends = {}, retryAfterSec = RETRY_AFTER_SEC }: HubOptions): TeamHub {
  const backendFor = (sdk: BotSdk): TeamBackend | undefined => backends[sdk] ?? (sdk === 'claude' ? claude : undefined)
  const catalog = createCatalog(db, config, backendFor)
  const active = new Map<string, ActiveTurn>()
  const cancelled = new Set<string>()
  const stopped = new AbortController()
  const search = hybridSearch(db)
  let running = false

  // Loop guards stop the whole team rather than one agent: a loop involves at least two agents, and the user should
  // see one alert, not one per agent. There is no spend limit: turns per hour, model turns per turn and the retry
  // limit are what bound a runaway bot.
  // Limits come from Settings (stored in SQLite) with taskq.config.json as the starting values; a bot's own limits
  // override the per-bot defaults.
  function guardsHold(name: string): boolean {
    const t = limits(db, config)
    const bot = getAgent(db, name)
    const hourAgo = Math.max(nowSec() - 3600, resumedAt(db))
    const total = Number(db.prepare('SELECT count(*) AS n FROM team_turns WHERE started_at >= ?').get(hourAgo)?.n ?? 0)
    if (total >= t.turns_per_hour_total) {
      pauseTeam(db, `the bots took ${total} turns in the last hour (limit ${t.turns_per_hour_total})`)
      return false
    }
    const recent = turnsSince(db, name, hourAgo)
    const own = bot?.hourly_turns ?? t.bot_turns_per_hour
    if (recent >= own) {
      pauseTeam(db, `${name} took ${recent} turns in the last hour (limit ${own}); bots may be messaging each other in a loop`)
      return false
    }
    return true
  }

  // The user stops a bot mid-turn. Its messages count as handled, its running task becomes cancelled.
  function cancel(name: string): boolean {
    const turn = active.get(name)
    if (!turn) return false
    cancelled.add(name)
    turn.controller.abort()
    return true
  }

  function launch(name: string): void {
    dropStaleHandover(name)
    const started = startTurn(db, name, BATCH)
    const agent = getAgent(db, name)
    if (!started || !agent) return
    try {
      const backend = backendFor(agent.sdk)
      if (!backend) throw new Error(`no ${agent.sdk} backend is configured (see wiki/sdk-usage.md)`)
      const controller = new AbortController()
      const own = agentDir(config, name)
      mkdirSync(own, { recursive: true })
      const cwd = botWorkdir(config, agent)
      const wiki = wikiDir(config)
      mkdirSync(wiki, { recursive: true })
      let plugins: string[] = []
      try {
        plugins = pluginPaths(db, config, name)
      } catch (error) {
        console.error(`taskq: could not load skills and plugins for ${name}: ${String(error)}`)
      }
      const shared = sharedDir(config)
      const t = limits(db, config)
      const live = backend.supportsLiveInput ? new LiveInput() : undefined
      const messages = [...started.messages]
      const done = backend.runTurn(config, {
        agent,
        system: systemFor(agent, listAgents(db), config, cwd, wiki, shared),
        prompt: promptFor(db, started.messages, shared),
        tools: teamTools({ db, config, agent: name, search, turnId: started.turn.id }),
        cwd,
        plugins,
        mcpServers: mcpServersFor(db, agent.mcp_servers ?? []),
        skills: skillsFor(db, config, agent),
        sharedDir: shared,
        maxTurns: agent.turn_max_turns ?? t.turn_max_turns,
        sessionMaxTokens: t.session_max_tokens,
        resume: agent.session_id,
        signal: controller.signal,
        turnId: started.turn.id,
        approvals: {
          consume: (tool, command) => consumeApproval(db, name, tool, command),
          request: (tool, command, rule) => requestApproval(db, name, tool, command, rule).id,
        },
        live,
      })
        .catch((error: unknown): TurnResult => ({ outcome: 'failed', error: error instanceof Error ? error.message : String(error) }))
        .then((result) => finish(name, started.turn.id, agent.session_id, messages, result, controller.signal.aborted))
        .catch((error: unknown) => console.error(`taskq: team turn of ${name} crashed: ${String(error)}`))
        .finally(() => {
          active.delete(name)
          teamChanged.notify()
        })
      active.set(name, { controller, done, turnId: started.turn.id, live, messages, joins: 0 })
    } catch (error) {
      // Preparing the turn failed (a folder could not be created, a prompt could not be built). Close the turn so the
      // bot is not left looking busy until the next restart.
      endTurn(db, started.turn.id, { outcome: 'failed', error: `could not start the turn: ${String(error)}` }, config.bots.maxAttempts)
      console.error(`taskq: could not start a turn for ${name}: ${String(error)}`)
    }
  }

  function finish(name: string, turnId: number, session: string | null, messages: TeamMessage[], result: TurnResult, aborted: boolean): void {
    if (result.session_missing) replaceAgentSession(db, name, session, null)
    else if (result.session_id) replaceAgentSession(db, name, session, result.session_id)
    const wasCancelled = cancelled.delete(name)
    const outcome = wasCancelled ? 'cancelled' : aborted ? 'interrupted' : result.outcome
    const cost = turnCost(name, session, result) ?? 0
    const end = endTurn(db, turnId, {
      outcome, error: result.error, turns: result.turns, cost_usd: cost, session_id: result.session_id,
    }, result.rejected ? 1 : config.bots.maxAttempts)
    recordUsage(db, turnId, name, result)
    reportSetAside(name, end, result.error, result.rejected)
    if (outcome === 'done') handOver(name, session, messages)
    if (result.tampered) pauseTeam(db, `${name} tried to reach taskq itself: ${result.tampered}`, 'security_finding')
    if (result.auth_failed) signedOut(name)
    // Work on a task happens inside one turn. A task still running when the turn ends goes back to ready, and the bot is
    // reminded, so a forgotten finish_task does not hold the task (and the run button) forever.
    if (outcome === 'cancelled') {
      for (const id of releaseBotTasks(db, name, 'cancelled by user', 'ready')) {
        db.prepare(`UPDATE tasks SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'ready'`).run(nowSec(), id)
      }
      const note = postMessage(db, { sender: SYSTEM, recipient: name, body: 'The user cancelled this turn.' })
      db.prepare('UPDATE team_messages SET read_at = created_at WHERE id = ?').run(note)
    } else if (outcome !== 'interrupted') {
      const left = releaseBotTasks(db, name, 'the turn ended without finish_task', 'ready')
      if (left.length > 0 && outcome === 'done') {
        postMessage(db, { sender: SYSTEM, recipient: name, body: `Your turn ended while task${left.length > 1 ? 's' : ''} ${left.join(', ')} ${left.length > 1 ? 'were' : 'was'} running without finish_task. ${left.length > 1 ? 'They are' : 'It is'} ready again; start_task and finish_task within one turn.` })
      }
    }
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

  // Claude reports the session's running cost total, and a resumed session starts from the total its transcript saved.
  // The turn's cost is the difference to the total recorded after the session's previous turn. A total below that one
  // means the transcript kept no total, so the whole figure is this turn's.
  function turnCost(name: string, session: string | null, result: TurnResult): number | undefined {
    if (result.session_total_usd === undefined) return result.cost_usd
    const before = session !== null && result.session_id === session
      ? Number(db.prepare('SELECT session_cost_usd FROM team_agents WHERE name = ?').get(name)?.session_cost_usd ?? 0)
      : 0
    db.prepare('UPDATE team_agents SET session_cost_usd = ? WHERE name = ?').run(result.session_total_usd, name)
    return result.session_total_usd >= before ? result.session_total_usd - before : result.session_total_usd
  }

  // Claude bots share one login, so a failed Claude login pauses the team. An OpenAI or Kiro login belongs to that bot's
  // runtime (an API key, Codex, kiro-cli): only that bot is turned off until the user signs in and turns it back on.
  function signedOut(name: string): void {
    const agent = getAgent(db, name)
    if (!agent || agent.sdk === 'claude') {
      pauseTeam(db, `${LOGIN_FAILED} for ${name}`)
      return
    }
    setAgentEnabled(db, name, false)
    setMeta(db, signedOutKey(name), '1')
    const runtime = agent.sdk === 'openai' ? `OpenAI (${agent.provider ?? 'api'})` : 'Kiro'
    raiseAlert(db, { task_id: null, kind: 'auth_required', message: `${name} was turned off: its ${runtime} login failed. Sign in, then turn the bot on again.` })
  }

  // A resumed conversation is sent, or billed, again with every turn, so a bot that talks for weeks pays for its whole
  // past each time. When the context a turn ended with passes session_max_tokens (or 80% of the model's window), the bot
  // is asked once to write itself a handover note (write_handover). The turn that reads the request is the session's
  // last: it handles its other messages as usual, and when it ends the session is dropped and the note is the first
  // message of the new one. The bot summarizes itself because only its own session holds the conversation; a bot that
  // writes no note still has its memory and the wiki.
  // The marker is `<request message id>:<session it was asked in>`.
  // Codex is left out: it reports no context size and compacts its own thread at the same limit (codex.ts).
  const handoverKey = (name: string) => `team_handover:${name}`
  const handoverNoteKey = (name: string) => `team_handover_note:${name}`
  const clearHandover = (name: string) => db.prepare('DELETE FROM meta WHERE key IN (?, ?)').run(handoverKey(name), handoverNoteKey(name))

  // Before a turn starts: a request that no longer waits in the inbox (its turn was cancelled, or it was set aside), or
  // that was made in another session (the user reset the bot, or its SDK or provider changed), is withdrawn, so a new
  // conversation is not told it is ending.
  function dropStaleHandover(name: string): void {
    const asked = getMeta(db, handoverKey(name))
    if (asked === null) return
    const cut = asked.indexOf(':')
    const id = Number(asked.slice(0, cut))
    const row = db.prepare('SELECT read_at, failed_at FROM team_messages WHERE id = ?').get(id)
    const waiting = row !== undefined && row.read_at === null && row.failed_at === null
    if (waiting && getAgent(db, name)?.session_id === asked.slice(cut + 1)) return
    if (waiting) db.prepare('UPDATE team_messages SET read_at = ? WHERE id = ?').run(nowSec(), id)
    clearHandover(name)
  }

  // After a turn ended done. `session` is the one the turn resumed; null means it was the first turn of its session.
  function handOver(name: string, session: string | null, messages: TeamMessage[]): void {
    const asked = getMeta(db, handoverKey(name))
    if (asked !== null) {
      if (!messages.some((m) => m.id === Number(asked.slice(0, asked.indexOf(':'))))) return   // not delivered yet
      const note = getMeta(db, handoverNoteKey(name))
      clearHandover(name)
      resetAgentSession(db, name)
      if (note) postMessage(db, { sender: SYSTEM, recipient: name, body: `Your previous conversation was closed to keep turns small. This is the handover note you wrote in it:\n\n${note}` })
      return
    }
    // The size of a session's first turn is its floor (system prompt, tools, memory, the note itself): a new session
    // would start as large, so asking again would only loop.
    if (session === null) return
    const bot = db.prepare('SELECT sdk, provider, session_id, context_tokens AS tokens, context_window AS window FROM team_agents WHERE name = ?').get(name)
    if (!bot || bot.session_id === null || bot.tokens === null || (bot.sdk === 'openai' && bot.provider === 'chatgpt')) return
    const tokens = Number(bot.tokens)
    const window = bot.window === null ? null : Number(bot.window)
    const max = limits(db, config).session_max_tokens
    // Kiro reports a percentage (window 100), not tokens.
    const over = window === 100 ? tokens >= 80 : tokens >= Math.min(max, window ? window * 0.8 : max)
    if (!over) return
    clearHandover(name)
    const id = postMessage(db, {
      sender: SYSTEM, recipient: name,
      body: `This conversation has grown to ${window === 100 ? `${tokens}% of its context` : `${tokens} tokens`}, and all of it is sent again with every turn. This turn is its last: the next one starts with an empty conversation. Handle the other messages of this turn as usual. Then, as the last thing you do, call write_handover with a handover note: the work in progress and its next step, what the user asked for and is still waiting on, decisions made and why, and the files and task ids involved. If more messages arrive after that, handle them and call write_handover again. Put lasting facts in memory_write or the wiki instead.`,
    })
    setMeta(db, handoverKey(name), `${id}:${String(bot.session_id)}`)
  }

  function reportSetAside(name: string, end: TurnEnd, error: string | undefined, rejected = false): void {
    if (end.setAside.length === 0) return
    const ids = end.setAside.map((m) => `#${m.id}`).join(', ')
    const why = end.reason === 'writes'
      ? 'the turn failed after it had already sent messages or created tasks, so it is not retried (a retry would repeat them)'
      : rejected ? 'the model provider refused the request, so it is not retried; fix the bot\'s model or settings'
        : `${config.bots.maxAttempts} turns failed on them`
    raiseAlert(db, {
      task_id: end.setAside[0].task_id, kind: 'team_message',
      message: `Messages ${ids} to ${name} were set aside: ${why}. Last error: ${error ?? 'interrupted'}. Check taskq bots log and resend if needed.`,
    })
  }

  function cancelRequested(): void {
    for (const [name, turn] of active) {
      const marker = getMeta(db, cancelKey(name))
      if (marker === null) continue
      db.prepare('DELETE FROM meta WHERE key = ?').run(cancelKey(name))
      if (Number(marker) === turn.turnId) cancel(name)
    }
  }

  // Mail for a bot that is already working goes into its running turn instead of waiting for the turn to end.
  function joinRunning(): void {
    for (const [name, turn] of active) {
      if (!turn.live || turn.live.isClosed() || turn.joins >= MAX_JOINS || turn.controller.signal.aborted) continue
      const joined = joinTurn(db, turn.turnId, name, BATCH)
      if (joined.length === 0) continue
      if (!turn.live.push(promptFor(db, joined, sharedDir(config)))) {
        leaveTurn(db, joined.map((m) => m.id))
        continue
      }
      turn.joins += 1
      turn.messages.push(...joined)
    }
  }

  function tick(): void {
    cancelRequested()
    if (isTeamPaused(db)) return
    // A sign-in changed from the CLI or MCP (another process) reaches this one here; the UI applies it at once.
    applyConnectionSettings(db, config)
    // Routines come due as messages; the turn that follows is an ordinary one, under the same guards.
    runDueRoutines(db)
    runTriggeredRoutines(db)
    joinRunning()
    for (const id of skipDisabledSpeakers(db).closed) {
      raiseAlert(db, { task_id: null, kind: 'team_message', message: `Discussion #${id} was closed without a conclusion: its moderator is disabled.` })
    }
    for (const name of agentsWithMail(db, nowSec(), retryAfterSec)) {
      if (active.size >= limits(db, config).max_concurrent_turns) return
      if (active.has(name)) continue
      if (!guardsHold(name)) return
      launch(name)
    }
  }

  // Wakes on an in-process change, at the next scheduled delivery, or every pollSec for writes from the CLI.
  async function loop(seen: number): Promise<void> {
    while (running) {
      const now = nowSec()
      const due = Math.min(nextDelivery(db, now) ?? Infinity, nextRoutineAt(db) ?? Infinity)
      const untilDue = due === Infinity ? Infinity : Math.max(0, (due - now) * 1000)
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
      seedAgents(db, ROSTER)
      for (const { agent, end } of recoverTurns(db)) reportSetAside(agent, end, 'taskq stopped during the turn')
      recoverBotTasks(db)
      running = true
      const seen = teamChanged.version()
      tick()
      void loop(seen)
    },
    cancel,
    catalog,
    busy: () => [...active.keys()],
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
