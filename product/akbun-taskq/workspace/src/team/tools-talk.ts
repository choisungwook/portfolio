import { z } from 'zod'
import { USER, getAgent, listAgents, openTurnAgents, postMessage } from '../db/team.ts'
import { closeThread, getThread, openThread, openThreadCount, speakerOf, takeTurn } from '../db/threads.ts'
import { getPage, writePage } from '../db/wiki.ts'
import { raiseAlert } from '../alerts/rules.ts'
import { nowSec } from '../time.ts'
import { teamChanged } from '../wake.ts'
import { ToolError, type ScopedTools, type TeamTool } from './tools.ts'
import { mirrorPage } from './wiki-files.ts'

// Each open discussion costs a turn per speaker per round, so few may run at once.
const MAX_OPEN_THREADS = 3
const MAX_DELAY_SEC = 30 * 24 * 3600
// A reminder to oneself must be at least this far ahead; otherwise deliver_at would let an agent wake itself in a loop.
const MIN_SELF_DELAY_SEC = 10 * 60
const PAST_GRACE_SEC = 60

export function talkTools(scope: ScopedTools): TeamTool[] {
  const { db, config, agent, wrote } = scope
  const self = () => {
    const row = getAgent(db, agent)
    if (!row) throw new ToolError(`agent ${agent} no longer exists`)
    return row
  }
  const enabled = (name: string) => getAgent(db, name)?.enabled === true

  return [
    {
      name: 'list_agents',
      description: 'List the team: name, role, description, whether the agent is busy with a turn now.',
      input: {},
      readOnly: true,
      handler() {
        const busy = new Set(openTurnAgents(db))
        return {
          agents: listAgents(db).filter((a) => a.enabled).map((a) => ({
            name: a.name, role: a.role, description: a.description, task_types: a.task_types, busy: busy.has(a.name),
          })),
        }
      },
    },
    {
      name: 'send_message',
      description: 'Send a message to another agent, or to "user" if you are allowed to. Delivery is asynchronous: a reply arrives in a later turn; never wait for it. deliver_at (ISO time, up to 30 days ahead) holds the message until then; with deliver_at you may also message yourself as a reminder.',
      input: {
        to: z.string().max(80),
        body: z.string().min(1).max(8000),
        reply_to: z.number().int().positive().optional(),
        task_id: z.string().regex(/^[0-9a-f]{8}$/).optional(),
        deliver_at: z.string().max(40).optional(),
      },
      readOnly: false,
      handler(args) {
        const to = String(args.to)
        const deliverAt = args.deliver_at === undefined ? undefined : timeOf(String(args.deliver_at))
        if (to === agent && (deliverAt === undefined || deliverAt < nowSec() + MIN_SELF_DELAY_SEC)) {
          throw new ToolError('a message to yourself needs deliver_at at least 10 minutes ahead; for notes, use the wiki')
        }
        if (to === USER) {
          if (!self().may_message_user) throw new ToolError('only the lead messages the user; send this to the lead')
        } else if (!enabled(to)) {
          throw new ToolError(`no enabled agent named ${to}; call list_agents`)
        }
        const id = postMessage(db, {
          sender: agent, recipient: to, body: String(args.body), deliver_at: deliverAt,
          reply_to: args.reply_to as number | undefined, task_id: args.task_id as string | undefined,
        })
        wrote()
        if (to === USER) {
          raiseAlert(db, { task_id: (args.task_id as string | undefined) ?? null, kind: 'team_message', message: `${agent}: ${String(args.body).slice(0, 300)}`, ref: String(id) })
        }
        teamChanged.notify()
        return { message_id: id, deliver_at: deliverAt === undefined ? 'now' : new Date(deliverAt * 1000).toISOString() }
      },
    },
    {
      name: 'start_discussion',
      description: 'Open a discussion: 2 to 4 agents (you may include yourself) speak in the listed order for 1 to 3 rounds, each seeing what was said before. You moderate and must conclude it. Use it when a question needs several views; do not use it to split work, which is what tasks are for.',
      input: {
        topic: z.string().min(1).max(300),
        participants: z.array(z.string().max(80)).min(2).max(4),
        rounds: z.number().int().min(1).max(3),
        context: z.string().max(4000),
      },
      readOnly: false,
      handler(args) {
        const participants = [...new Set(args.participants as string[])]
        if (participants.length < 2) throw new ToolError('a discussion needs at least two different participants')
        const missing = participants.filter((name) => !enabled(name))
        if (missing.length) throw new ToolError(`not enabled agents: ${missing.join(', ')}`)
        if (openThreadCount(db) >= MAX_OPEN_THREADS) throw new ToolError(`${MAX_OPEN_THREADS} discussions are already open; conclude one first`)
        const thread = openThread(db, {
          topic: String(args.topic), moderator: agent, participants, rounds: Number(args.rounds), context: String(args.context),
        })
        wrote()
        teamChanged.notify()
        return { thread_id: thread.id, first_speaker: participants[0] }
      },
    },
    {
      name: 'discuss',
      description: 'Speak in a discussion when it is your turn. Give your view with reasons and evidence; disagree when you disagree. Do not create or assign tasks from a discussion; the moderator does that after concluding.',
      input: { thread_id: z.number().int().positive(), body: z.string().min(1).max(4000) },
      readOnly: false,
      handler(args) {
        const id = Number(args.thread_id)
        const thread = getThread(db, id)
        if (!thread) throw new ToolError('no such discussion')
        const speaker = speakerOf(thread)
        if (speaker !== agent) throw new ToolError(thread.status === 'open' ? `it is ${speaker}'s turn, not yours` : `discussion is ${thread.status}`)
        const next = takeTurn(db, id, agent, String(args.body))
        if (!next) throw new ToolError('the discussion changed meanwhile')
        wrote()
        teamChanged.notify()
        return { thread_id: id, status: next.status, next: speakerOf(next) ?? next.moderator }
      },
    },
    {
      name: 'conclude_discussion',
      description: 'Close a discussion you moderate, with the conclusion: what was decided, the disagreements left, and who does what next. With wiki_slug the conclusion is also written to that wiki page (created, or appended to).',
      input: { thread_id: z.number().int().positive(), conclusion: z.string().min(1).max(6000), wiki_slug: z.string().max(250).optional() },
      readOnly: false,
      handler(args) {
        const id = Number(args.thread_id)
        const thread = getThread(db, id)
        if (!thread || thread.moderator !== agent) throw new ToolError('only the moderator closes a discussion')
        const slug = args.wiki_slug as string | undefined
        if (slug !== undefined) {
          const current = getPage(db, slug)
          const section = `## Discussion #${id}: ${thread.topic}\n\nParticipants: ${thread.participants.join(', ')}\n\n${String(args.conclusion)}`
          const written = writePage(db, {
            slug, title: current?.title ?? thread.topic, author: agent, base_revision: current?.revision ?? 0,
            body: current ? `${current.body}\n\n${section}` : section,
          })
          if (!written.ok) throw new ToolError(written.error)
          mirrorPage(config, getPage(db, slug)!)
        }
        if (!closeThread(db, id, agent, String(args.conclusion), slug ?? null)) throw new ToolError('discussion is already closed')
        wrote()
        teamChanged.notify()
        return { thread_id: id, status: 'closed' }
      },
    },
  ]
}

function timeOf(text: string): number {
  const ms = Date.parse(text)
  if (Number.isNaN(ms)) throw new ToolError('deliver_at must be an ISO 8601 time such as 2026-11-20T09:00:00+09:00')
  const at = Math.floor(ms / 1000)
  const now = nowSec()
  if (at > now + MAX_DELAY_SEC) throw new ToolError('deliver_at may be at most 30 days ahead')
  if (at < now - PAST_GRACE_SEC) throw new ToolError('deliver_at is in the past; omit it to send now')
  return Math.max(at, now)
}
