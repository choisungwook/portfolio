import { z } from 'zod'
import type { Db } from '../db/open.ts'
import { getAgent, postMessage } from '../db/team.ts'
import { createFromInput, getTask, TASK_TITLE_SQL } from '../db/tasks.ts'
import { findAccessSkill } from '../db/access-skills.ts'
import { parseTaskInput, TASK_TYPES } from '../validate.ts'
import { describeRun } from '../db/workflows.ts'
import { WORKFLOW_HOW } from './workflow-work.ts'
import { queueChanged, teamChanged } from '../wake.ts'
import { raiseAlert } from '../alerts/rules.ts'
import type { Task, TaskType } from '../types.ts'
import { ToolError, repoAllowed, type ScopedTools, type TeamTool } from './tools.ts'
import { finishBotTask, startBotTask, type BotOutcome } from './bot-work.ts'

// A task has exactly one owner. The owner works on it (start_task, finish_task) and is the only bot that hands it on,
// besides the coordinators (orchestrator and planner). Before a task is created it is compared with every open task, so two agents told
// about the same work do not both queue it.

// Roles that hand out work. The orchestrator taskq has the first; a user-made bot gets it by choosing the planner role.
const COORDINATORS = new Set(['orchestrator', 'planner'])
// Statuses that hold a slot of bots.maxOpenTasks. draft and review wait for the user, not for the team.
const ACTIVE = `('ready', 'running', 'needs_approval', 'needs_auth')`
const UNFINISHED = `status NOT IN ('done', 'failed', 'cancelled')`
// Character-trigram overlap (Jaccard) at which two intents count as the same work. This is an advisory check, not a
// guarantee: one reworded pair measured 0.64 (0.61 in Korean), but a review found both errors. "Fix login bug" and
// "Fix logout bug" score 0.73 (false match), and "add retry limit to export job" vs "export job: cap the number of
// retries" scores 0.22 (missed). The refusal names the open task so the agent asks its owner; not_duplicate_of
// overrides a false match. Ownership, not this check, is what keeps two agents off one task.
export const DUPLICATE_SIMILARITY = 0.5
const AGENT_MAX_PRIORITY = 0
const TASK_ID = z.string().regex(/^[0-9a-f]{8}$/)

export function taskTools(scope: ScopedTools): TeamTool[] {
  const { db, config, agent, wrote } = scope
  const self = () => {
    const row = getAgent(db, agent)
    if (!row) throw new ToolError(`agent ${agent} no longer exists`)
    return row
  }

  return [
    {
      name: 'create_task',
      description: 'Record a task and own it (or give it to `owner`, who is told). The owner works on it with start_task and finish_task. Refused when an open task looks like the same work: then message its owner, or pass its id in not_duplicate_of if it really differs. Tasks touching an account (ops types, access_skill, target_profile) are drafts the user must promote.',
      input: {
        type: z.enum(TASK_TYPES as [TaskType, ...TaskType[]]),
        intent: z.string().min(1).max(4000),
        title: z.string().max(200).optional(),
        cautions: z.string().max(4000).optional(),
        repo: z.string().max(500).optional(),
        output_path: z.string().max(500).optional(),
        access_skill: z.string().max(100).optional(),
        target_profile: z.string().max(100).optional(),
        depends_on: z.array(TASK_ID).max(20).optional(),
        priority: z.number().int().min(-100).max(AGENT_MAX_PRIORITY).optional(),
        owner: z.string().max(80).optional(),
        draft: z.boolean().optional(),
        not_duplicate_of: z.array(TASK_ID).max(10).optional(),
        workflow: z.string().max(100).optional().describe('a workflow (name or id) the owner runs for this task; list_workflows shows them'),
        review_required: z.boolean().optional().describe('the task counts as done only after a reviewer bot (or the user) checks the owner\'s result'),
      },
      readOnly: false,
      handler(args) {
        const type = args.type as TaskType
        const owner = (args.owner as string | undefined) ?? agent
        if (!getAgent(db, owner)?.enabled) throw new ToolError(`no enabled agent named ${owner}`)
        const repo = args.repo as string | undefined
        if (repo !== undefined && !repoAllowed(config, repo)) {
          throw new ToolError('repo must be one of trustedRepos or under bots.readRoots in taskq.config.json')
        }
        const active = Number(db.prepare(`SELECT count(*) AS n FROM tasks WHERE owner IS NOT NULL AND status IN ${ACTIVE}`).get()?.n ?? 0)
        if (active >= config.bots.maxOpenTasks) {
          throw new ToolError(`the team already has ${active} queued or running tasks (limit ${config.bots.maxOpenTasks}); wait for one to end`)
        }
        const dup = duplicates(db, String(args.intent)).filter((d) => !((args.not_duplicate_of as string[] | undefined) ?? []).includes(d.id))
        if (dup.length > 0) {
          throw new ToolError(`looks like open work already: ${dup.map((d) => `${d.id} (${d.status}, owner ${d.owner ?? 'user'}): ${d.intent.slice(0, 80)}`).join('; ')}`)
        }
        const touchesAccount = type === 'ops_read' || type === 'ops_change' || args.access_skill !== undefined || args.target_profile !== undefined
        const draft = args.draft === true || touchesAccount
        const { owner: _owner, draft: _draft, not_duplicate_of: _nd, workflow, ...input } = args
        const parsed = parseTaskInput({ ...input, workflow_id: workflow, status: draft ? 'draft' : 'ready' }, (name) => findAccessSkill(db, name) !== undefined)
        if (!parsed.ok) throw new ToolError(parsed.error)
        let task: Task
        try {
          task = createFromInput(db, parsed.value, owner, config)
        } catch (error) {
          throw new ToolError(error instanceof Error ? error.message : String(error))
        }
        wrote()
        if (owner !== agent) postMessage(db, { sender: agent, recipient: owner, task_id: task.id, body: `I created task ${task.id} for you: ${task.data.intent}` })
        queueChanged.notify()
        teamChanged.notify()
        return { task_id: task.id, status: task.status, owner }
      },
    },
    {
      name: 'assign_task',
      description: 'Hand a task to another bot. Allowed for the current owner, and for the orchestrator and planners on any unfinished task (including the user\'s own tasks). Both the old and the new owner are told.',
      input: { task_id: TASK_ID, to: z.string().max(80), note: z.string().max(2000).optional() },
      readOnly: false,
      handler(args) {
        const me = self()
        const task = getTask(db, String(args.task_id))
        if (!task) throw new ToolError('task not found')
        if (task.status === 'done' || task.status === 'failed') throw new ToolError(`task is ${task.status}; create a new one instead`)
        if (task.status === 'running') throw new ToolError('task is running; it can change hands after it finishes')
        if (task.owner !== agent && !COORDINATORS.has(me.role)) {
          throw new ToolError(`task ${task.id} is owned by ${task.owner ?? 'the user'}; ask them or taskq`)
        }
        const to = String(args.to)
        if (!getAgent(db, to)?.enabled) throw new ToolError(`no enabled agent named ${to}`)
        const changed = db.prepare(`UPDATE tasks SET owner = ?, owner_since = unixepoch() WHERE id = ? AND owner IS ? AND ${UNFINISHED}`).run(to, task.id, task.owner).changes
        if (changed !== 1) throw new ToolError('the task changed meanwhile; read it again')
        wrote()
        const note = args.note ? `\n${String(args.note)}` : ''
        postMessage(db, { sender: agent, recipient: to, task_id: task.id, body: `Task ${task.id} is now yours: ${task.data.intent}${note}` })
        if (task.owner === null) {
          raiseAlert(db, { task_id: task.id, kind: 'team_message', message: `${agent} gave your task ${task.id} to ${to}; its result now goes to ${to}. Take it back in the task detail.` })
        }
        if (task.owner && task.owner !== agent && task.owner !== to) {
          postMessage(db, { sender: agent, recipient: task.owner, task_id: task.id, body: `I moved task ${task.id} from you to ${to}.${note}` })
        }
        teamChanged.notify()
        return { task_id: task.id, owner: to }
      },
    },
    {
      name: 'start_task',
      description: 'Begin work on a task you own. It shows as running on the board and the calendar until you call finish_task. Refused while a task it depends on is not done.',
      input: { task_id: TASK_ID },
      readOnly: false,
      handler(args) {
        const started = startBotTask(db, agent, String(args.task_id), self().session_id)
        if (!started.ok) throw new ToolError(started.error)
        wrote()
        const task = getTask(db, String(args.task_id))!
        // A code task in a repository has its own worktree: the bot works and commits there, never in the user's checkout.
        const where = task.data.worktree
          ? {
            workspace: task.data.repo, branch: task.data.worktree.branch,
            note: self().sandbox
              ? `Work in ${task.data.repo} (branch ${task.data.worktree.branch}), not in ${task.data.source_repo}. Your sandbox cannot write the repository's .git, so leave the changes uncommitted; the user sees them in the task.`
              : `Work and commit in ${task.data.repo} (branch ${task.data.worktree.branch}), not in ${task.data.source_repo}. If you open a pull request, put its URL in the finish_task summary.`,
          }
          : task.data.repo ? { workspace: task.data.repo } : {}
        if (!started.workflow) return { task_id: args.task_id, status: 'running', run_id: started.runId, ...where }
        return {
          task_id: args.task_id, status: 'running', run_id: started.runId, ...where, workflow_run_id: started.workflow.id,
          workflow: describeRun(started.workflow), how: WORKFLOW_HOW,
        }
      },
    },
    {
      name: 'finish_task',
      description: 'End work on a task you started. outcome done: finished; review: finished and the user should look; failed: could not be done. The summary is what the user reads: what you did and the evidence (commands, output, file paths).',
      input: { task_id: TASK_ID, outcome: z.enum(['done', 'review', 'failed']), summary: z.string().min(1).max(4000) },
      readOnly: false,
      handler(args) {
        const finished = finishBotTask(db, agent, String(args.task_id), args.outcome as BotOutcome, String(args.summary))
        if (!finished.ok) throw new ToolError(finished.error)
        wrote()
        queueChanged.notify()
        return { task_id: args.task_id, outcome: args.outcome }
      },
    },
    {
      name: 'list_tasks',
      description: 'List queue tasks with status, owner and the summary of their last run. mine=true lists only your tasks; owner filters by agent ("user" for unowned).',
      input: { mine: z.boolean().optional(), owner: z.string().max(80).optional(), status: z.string().max(20).optional() },
      readOnly: true,
      handler(args) {
        const owner = args.mine ? agent : (args.owner as string | undefined)
        const status = (args.status as string | undefined) ?? null
        const rows = db.prepare(`SELECT t.id, t.type, t.status, t.owner, ${TASK_TITLE_SQL},
          (SELECT summary FROM runs r WHERE r.task_id = t.id AND r.ended_at IS NOT NULL ORDER BY r.rowid DESC LIMIT 1) AS last_summary
          FROM tasks t WHERE (? IS NULL OR t.status = ?)
            AND (? IS NULL OR (? = 'user' AND t.owner IS NULL) OR t.owner = ?)
          ORDER BY t.updated_at DESC LIMIT 50`).all(status, status, owner ?? null, owner ?? null, owner ?? null)
        return { tasks: rows }
      },
    },
    {
      name: 'get_task',
      description: 'Read one task: intent, status, owner, and the outcome, summary and output path of its last run.',
      input: { task_id: TASK_ID },
      readOnly: true,
      handler(args) {
        const task = getTask(db, String(args.task_id))
        if (!task) throw new ToolError('task not found')
        const run = db.prepare(`SELECT outcome, summary, output_path, ended_at FROM runs WHERE task_id = ? AND ended_at IS NOT NULL
          ORDER BY rowid DESC LIMIT 1`).get(task.id)
        return { id: task.id, type: task.type, status: task.status, intent: task.data.intent, owner: task.owner, last_run: run ?? null }
      },
    },
  ]
}

function trigrams(text: string): Set<string> {
  const chars = [...text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()]
  const grams = new Set<string>()
  for (let i = 0; i + 3 <= chars.length; i++) grams.add(chars.slice(i, i + 3).join(''))
  return grams
}

export function similarity(a: string, b: string): number {
  const x = trigrams(a)
  const y = trigrams(b)
  if (x.size === 0 || y.size === 0) return 0
  let shared = 0
  for (const gram of x) if (y.has(gram)) shared += 1
  return shared / (x.size + y.size - shared)
}

export function duplicates(db: Db, intent: string): { id: string; status: string; owner: string | null; intent: string }[] {
  // Only work still to be done: a task in review is finished work the user is reading, and follow-ups to it are new.
  const open = db.prepare(`SELECT id, status, owner, json_extract(data, '$.intent') AS intent FROM tasks
    WHERE status IN ('draft', 'ready', 'running', 'needs_approval', 'needs_auth')`)
    .all() as { id: string; status: string; owner: string | null; intent: string }[]
  return open.filter((task) => similarity(intent, task.intent) >= DUPLICATE_SIMILARITY)
}
