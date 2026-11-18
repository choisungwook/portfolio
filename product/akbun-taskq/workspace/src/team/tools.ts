import { z } from 'zod'
import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import { USER, getAgent, listAgents, openTurnAgents, postMessage } from '../db/team.ts'
import { getPage, listPages, searchPages, writePage } from '../db/wiki.ts'
import { createFromInput, getTask, TASK_TITLE_SQL } from '../db/tasks.ts'
import { findAccessSkill } from '../db/access-skills.ts'
import { parseTaskInput, TASK_TYPES } from '../validate.ts'
import { raiseAlert } from '../alerts/rules.ts'
import { realPath, under } from '../worker/paths.ts'
import { queueChanged, teamChanged } from '../wake.ts'
import type { TaskType } from '../types.ts'

// The tools every agent session gets, independent of the agent SDK. A backend wraps each one in its own tool format.
// A handler returns a JSON object, or throws ToolError with a message the model can act on.

export class ToolError extends Error {}

export interface TeamTool {
  name: string
  description: string
  input: z.ZodRawShape
  readOnly: boolean
  handler(args: Record<string, unknown>): Record<string, unknown>
}

export interface ToolScope { db: Db; config: Config; agent: string }

const SUMMARY_SQL = `(SELECT summary FROM runs r WHERE r.task_id = t.id AND r.ended_at IS NOT NULL ORDER BY r.rowid DESC LIMIT 1)`

export function teamTools(scope: ToolScope): TeamTool[] {
  const { db, config, agent } = scope
  const self = () => {
    const row = getAgent(db, agent)
    if (!row) throw new ToolError(`agent ${agent} no longer exists`)
    return row
  }

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
      description: 'Send a message to another agent, or to "user" if you are allowed to. Delivery is asynchronous: the reply, if any, arrives in a later turn. Never wait for it.',
      input: {
        to: z.string().max(80),
        body: z.string().min(1).max(8000),
        reply_to: z.number().int().positive().optional(),
        task_id: z.string().regex(/^[0-9a-f]{8}$/).optional(),
      },
      readOnly: false,
      handler(args) {
        const to = String(args.to)
        if (to === agent) throw new ToolError('you cannot message yourself; write notes to the wiki instead')
        if (to === USER) {
          if (!self().may_message_user) throw new ToolError('only the lead messages the user; send this to the lead')
        } else if (!getAgent(db, to)?.enabled) {
          throw new ToolError(`no enabled agent named ${to}; call list_agents`)
        }
        const id = postMessage(db, {
          sender: agent, recipient: to, body: String(args.body),
          reply_to: args.reply_to as number | undefined, task_id: args.task_id as string | undefined,
        })
        if (to === USER) raiseAlert(db, { task_id: (args.task_id as string | undefined) ?? null, kind: 'team_message', message: `${agent}: ${String(args.body).slice(0, 300)}`, ref: String(id) })
        teamChanged.notify()
        return { message_id: id }
      },
    },
    {
      name: 'create_task',
      description: 'Add a task to the queue. It runs in its own sandboxed session; its result is posted to the assignee (default: you) when it ends. ops_read and ops_change tasks are always drafts that the user must promote.',
      input: {
        type: z.enum(TASK_TYPES as [TaskType, ...TaskType[]]),
        intent: z.string().min(1).max(4000),
        title: z.string().max(200).optional(),
        cautions: z.string().max(4000).optional(),
        repo: z.string().max(500).optional(),
        output_path: z.string().max(500).optional(),
        access_skill: z.string().max(100).optional(),
        target_profile: z.string().max(100).optional(),
        depends_on: z.array(z.string().regex(/^[0-9a-f]{8}$/)).max(20).optional(),
        priority: z.number().int().min(-100).max(100).optional(),
        assignee: z.string().max(80).optional(),
        draft: z.boolean().optional(),
      },
      readOnly: false,
      handler(args) {
        const me = self()
        const type = args.type as TaskType
        if (!me.task_types.includes(type)) throw new ToolError(`your role may create ${me.task_types.join(', ') || 'no'} tasks, not ${type}; ask the planner`)
        const assignee = (args.assignee as string | undefined) ?? agent
        if (!getAgent(db, assignee)?.enabled) throw new ToolError(`no enabled agent named ${assignee}`)
        const repo = args.repo as string | undefined
        if (repo !== undefined && !repoAllowed(config, repo)) {
          throw new ToolError('repo must be one of trustedRepos or under team.readRoots in taskq.config.json')
        }
        if (openAgentTasks(db) >= config.team.maxOpenTasks) {
          throw new ToolError(`the team already has ${config.team.maxOpenTasks} open tasks; wait for results before adding more`)
        }
        const draft = args.draft === true || type === 'ops_read' || type === 'ops_change'
        const parsed = parseTaskInput({ ...args, assignee: undefined, draft: undefined, status: draft ? 'draft' : 'ready' },
          (name) => findAccessSkill(db, name) !== undefined)
        if (!parsed.ok) throw new ToolError(parsed.error)
        parsed.value.data.assignee = assignee
        let task
        try {
          task = createFromInput(db, parsed.value)
        } catch (error) {
          throw new ToolError(error instanceof Error ? error.message : String(error))
        }
        queueChanged.notify()
        return { task_id: task.id, status: task.status, assignee }
      },
    },
    {
      name: 'list_tasks',
      description: 'List queue tasks with status and the summary of their last run. mine=true lists only tasks whose results come to you.',
      input: { mine: z.boolean().optional(), status: z.string().max(20).optional() },
      readOnly: true,
      handler(args) {
        const rows = db.prepare(`SELECT t.id, t.type, t.status, json_extract(t.data, '$.assignee') AS assignee, ${TASK_TITLE_SQL}, ${SUMMARY_SQL} AS last_summary
          FROM tasks t WHERE (? IS NULL OR t.status = ?) AND (? = 0 OR json_extract(t.data, '$.assignee') = ?)
          ORDER BY t.updated_at DESC LIMIT 50`)
          .all((args.status as string | undefined) ?? null, (args.status as string | undefined) ?? null, args.mine ? 1 : 0, agent)
        return { tasks: rows }
      },
    },
    {
      name: 'get_task',
      description: 'Read one task: intent, status, assignee, and the outcome, summary and output path of its last run.',
      input: { task_id: z.string().regex(/^[0-9a-f]{8}$/) },
      readOnly: true,
      handler(args) {
        const task = getTask(db, String(args.task_id))
        if (!task) throw new ToolError('task not found')
        const run = db.prepare(`SELECT outcome, summary, output_path, ended_at FROM runs WHERE task_id = ? AND ended_at IS NOT NULL
          ORDER BY rowid DESC LIMIT 1`).get(task.id)
        return { id: task.id, type: task.type, status: task.status, intent: task.data.intent, assignee: task.data.assignee ?? null, last_run: run ?? null }
      },
    },
    {
      name: 'wiki_list',
      description: 'List every page of the shared team wiki: slug, title, revision, last author.',
      input: {},
      readOnly: true,
      handler: () => ({ pages: listPages(db) }),
    },
    {
      name: 'wiki_search',
      description: 'Full-text search over the shared team wiki. Search before you write a new page.',
      input: { query: z.string().min(1).max(200) },
      readOnly: true,
      handler: (args) => ({ results: searchPages(db, String(args.query)) }),
    },
    {
      name: 'wiki_read',
      description: 'Read a wiki page. Note its revision: wiki_write needs it.',
      input: { slug: z.string().max(250) },
      readOnly: true,
      handler(args) {
        const page = getPage(db, String(args.slug))
        if (!page) throw new ToolError('no such page; base_revision 0 creates it')
        return { ...page }
      },
    },
    {
      name: 'wiki_write',
      description: 'Create or replace a wiki page. base_revision is the revision you read (0 for a new page). If someone wrote in between, you get the current text back: merge and retry. Write facts and decisions that outlive this conversation, with where they came from.',
      input: {
        slug: z.string().max(250),
        title: z.string().max(200),
        body: z.string().max(20_000),
        base_revision: z.number().int().min(0),
      },
      readOnly: false,
      handler(args) {
        const result = writePage(db, {
          slug: String(args.slug), title: String(args.title), body: String(args.body), author: agent, base_revision: Number(args.base_revision),
        })
        if (!result.ok) throw new ToolError(JSON.stringify({ error: result.error, current: result.current ?? null }))
        return { revision: result.revision }
      },
    },
  ]
}

// The real path is compared, so a symlink inside a read root cannot point a code task at a directory outside it.
export function repoAllowed(config: Config, repo: string): boolean {
  const real = realPath(repo)
  return config.trustedRepos.some((trusted) => realPath(trusted) === real) || config.team.readRoots.some((root) => under(real, realPath(root)))
}

export function openAgentTasks(db: Db): number {
  return Number(db.prepare(`SELECT count(*) AS n FROM tasks WHERE json_extract(data, '$.assignee') IS NOT NULL
    AND status NOT IN ('done', 'failed')`).get()?.n ?? 0)
}
