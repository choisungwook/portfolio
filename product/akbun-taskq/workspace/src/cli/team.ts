import { parseArgs } from 'node:util'
import {
  USER, getAgent, listAgents, listMessages, listTurns, markRead, postMessage, seedAgents, setAgentEnabled, setAgentSession,
} from '../db/team.ts'
import { getPage, listPages } from '../db/wiki.ts'
import { listThreads, speakerOf } from '../db/threads.ts'
import { hybridSearch } from '../team/search.ts'
import { exportWiki } from '../team/wiki-files.ts'
import { setOwner } from '../team/owner.ts'
import { DEFAULT_ROSTER } from '../team/roster.ts'
import { isTeamPaused, pauseTeam, resumeTeam, teamPauseReason } from '../team/hub.ts'
import { teamChanged } from '../wake.ts'
import type { Command } from './types.ts'

const USAGE = `usage: taskq team <action>
  list                         agents, roles and whether each has a session
  say [--to NAME] TEXT...      message an agent (default: lead)
  inbox [--all]                messages the team sent you; marks them read unless --all
  log [--agent NAME] [--limit N]
  turns [--limit N]
  wiki [SLUG]                  list pages, or print one
  search QUERY...              search the wiki the way agents do
  export                       rewrite the markdown mirror under TASKQ_HOME/wiki/ (for graphify and other folder tools)
  assign TASK AGENT|user       give a task to an agent, or take it back
  threads                      discussions and whose turn it is
  pause [--reason TEXT]        resume
  enable NAME    disable NAME    reset NAME (start a new session next turn)`

function limitOf(value: string | undefined, fallback: number): number {
  const n = Number(value ?? fallback)
  if (!Number.isInteger(n) || n < 1 || n > 500) throw new Error('--limit must be an integer from 1 to 500')
  return n
}

export const team: Command = ({ config, db }, args) => {
  const [action, ...rest] = args
  // The roster is seeded here too, so a message can be queued before the first taskq run.
  seedAgents(db, DEFAULT_ROSTER)
  switch (action) {
    case 'list': {
      for (const a of listAgents(db)) {
        console.log(`${a.enabled ? ' ' : 'x'} ${a.name.padEnd(14)} ${a.role.padEnd(13)} ${a.session_id ? 'session' : 'new    '}  ${a.description}`)
      }
      if (!config.team.enabled) console.log('\nteam.enabled is false in taskq.config.json: messages wait until it is turned on.')
      if (isTeamPaused(db)) console.log(`\nteam paused: ${teamPauseReason(db)}`)
      return
    }
    case 'say': {
      const { values, positionals } = parseArgs({ args: rest, strict: true, allowPositionals: true, options: { to: { type: 'string' } } })
      const to = values.to ?? 'lead'
      const body = positionals.join(' ').trim()
      if (!body) throw new Error('usage: taskq team say [--to NAME] TEXT...')
      if (!getAgent(db, to)?.enabled) throw new Error(`no enabled agent named ${to}`)
      const id = postMessage(db, { sender: USER, recipient: to, body })
      teamChanged.notify()
      console.log(`message ${id} queued for ${to}`)
      return
    }
    case 'inbox': {
      const { values } = parseArgs({ args: rest, strict: true, options: { all: { type: 'boolean' } } })
      const messages = listMessages(db, { recipient: USER, unread: !values.all, limit: 50 }).reverse()
      for (const m of messages) {
        console.log(`#${m.id} ${new Date(m.created_at * 1000).toISOString()} from ${m.sender}${m.task_id ? ` (task ${m.task_id})` : ''}\n${m.body}\n`)
      }
      if (!values.all) markRead(db, messages.map((m) => m.id))
      if (messages.length === 0) console.log('no new messages')
      return
    }
    case 'log': {
      const { values } = parseArgs({ args: rest, strict: true, options: { agent: { type: 'string' }, limit: { type: 'string' } } })
      for (const m of listMessages(db, { agent: values.agent, limit: limitOf(values.limit, 30) }).reverse()) {
        console.log(`#${m.id} ${m.sender} -> ${m.recipient}${m.read_at ? '' : ' (unread)'}: ${m.body.replaceAll('\n', ' ').slice(0, 160)}`)
      }
      return
    }
    case 'turns': {
      const { values } = parseArgs({ args: rest, strict: true, options: { limit: { type: 'string' } } })
      for (const t of listTurns(db, limitOf(values.limit, 20))) {
        const cost = t.cost_usd === null ? '' : `$${t.cost_usd.toFixed(3)}`
        console.log(`${t.id} ${t.agent.padEnd(14)} ${(t.outcome ?? 'running').padEnd(11)} ${cost} ${t.error ?? ''}`)
      }
      return
    }
    case 'wiki': {
      const [slug] = rest
      if (!slug) {
        for (const p of listPages(db)) console.log(`${p.slug.padEnd(32)} r${p.revision} ${p.updated_by.padEnd(14)} ${p.title}`)
        return
      }
      const page = getPage(db, slug)
      if (!page) throw new Error('no such page')
      console.log(`# ${page.title}\n(revision ${page.revision} by ${page.updated_by})\n\n${page.body}`)
      return
    }
    case 'search': {
      const query = rest.join(' ').trim()
      if (!query) throw new Error('usage: taskq team search QUERY...')
      for (const hit of hybridSearch(db)(query, 20)) {
        console.log(`${hit.score.toFixed(2).padStart(6)} ${hit.slug}${hit.via ? ` (via ${hit.via})` : ''}  ${hit.snippet.replaceAll('\n', ' ')}`)
      }
      return
    }
    case 'export':
      console.log(`${exportWiki(db, config)} pages written`)
      return
    case 'assign': {
      const [taskId, to] = rest
      if (!taskId || !to) throw new Error('usage: taskq team assign TASK AGENT|user')
      setOwner(db, taskId, to === USER ? null : to, USER)
      console.log(`task ${taskId} is now owned by ${to}`)
      return
    }
    case 'threads': {
      for (const t of listThreads(db, 20)) {
        const turn = t.status === 'open' ? `next: ${speakerOf(t)}` : t.status === 'concluding' ? `waiting for ${t.moderator} to conclude` : 'closed'
        console.log(`#${t.id} [${t.status}] ${t.topic} — ${t.participants.join(', ')} · ${t.posts}/${t.rounds * t.participants.length} posts · ${turn}`)
      }
      return
    }
    case 'pause': {
      const { values } = parseArgs({ args: rest, strict: true, options: { reason: { type: 'string' } } })
      pauseTeam(db, values.reason ?? 'paused by the user')
      console.log('team paused')
      return
    }
    case 'resume':
      resumeTeam(db)
      console.log('team resumed')
      return
    case 'enable':
    case 'disable': {
      const [name] = rest
      if (!name || !setAgentEnabled(db, name, action === 'enable')) throw new Error(`no agent named ${name ?? ''}`)
      console.log(`${name} ${action}d`)
      return
    }
    case 'reset': {
      const [name] = rest
      if (!name || !getAgent(db, name)) throw new Error(`no agent named ${name ?? ''}`)
      setAgentSession(db, name, null)
      console.log(`${name} starts a new session on its next turn; the wiki is kept`)
      return
    }
    default:
      throw new Error(USAGE)
  }
}
