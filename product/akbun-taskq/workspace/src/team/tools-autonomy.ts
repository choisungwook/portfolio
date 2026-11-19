import { z } from 'zod'
import { getAgent, postMessage, ORCHESTRATOR } from '../db/team.ts'
import { createRoutine, deleteRoutine, getRoutine, listRoutines, TRIGGERS, type Trigger } from '../db/routines.ts'
import { closeGoal, getGoal } from '../db/goals.ts'
import { teamChanged } from '../wake.ts'
import { ToolError, type ScopedTools, type TeamTool } from './tools.ts'

// Tools for work that runs without the user in the loop each time: routines on a schedule or an event, closing a goal,
// and reviewing another bot's result.

const COORDINATORS = new Set(['orchestrator', 'planner'])
const TASK_ID = z.string().regex(/^[0-9a-f]{8}$/)

export function autonomyTools(scope: ScopedTools): TeamTool[] {
  const { db, agent, wrote } = scope
  const self = () => {
    const row = getAgent(db, agent)
    if (!row) throw new ToolError(`agent ${agent} no longer exists`)
    return row
  }
  const mayManage = (bot: string) => bot === agent || COORDINATORS.has(self().role)

  return [
    {
      name: 'schedule_routine',
      description: 'Set up work that repeats without being asked: on a schedule (5-field cron in the user\'s local time, e.g. "0 7 * * 1-5" for 7am on weekdays) or on a trigger (task_failed, task_created, webhook). When it comes due, the bot gets a message with the prompt. Use it when the user asks for something "every day", "every Monday", "whenever a task fails". Coordinators may set routines for other bots.',
      input: {
        name: z.string().min(1).max(100),
        prompt: z.string().min(1).max(4000).describe('what to do each time, written as an instruction to the bot'),
        schedule: z.string().max(100).optional(),
        trigger: z.enum(TRIGGERS as [Trigger, ...Trigger[]]).optional(),
        bot: z.string().max(80).optional().describe('the bot that does it; default yourself'),
      },
      readOnly: false,
      handler(args) {
        const bot = args.bot ? String(args.bot) : agent
        if (!getAgent(db, bot)) throw new ToolError(`no bot named ${bot}`)
        if (!mayManage(bot)) throw new ToolError('only coordinators set routines for other bots; ask the orchestrator')
        const made = createRoutine(db, {
          bot, name: String(args.name), prompt: String(args.prompt), schedule: (args.schedule as string | undefined) ?? null,
          trigger: (args.trigger as Trigger | undefined) ?? null, created_by: agent,
        })
        if (typeof made === 'string') throw new ToolError(made)
        wrote()
        teamChanged.notify()
        return { id: made.id, bot: made.bot, next_run_at: made.next_run_at ? new Date(made.next_run_at * 1000).toISOString() : null, trigger: made.trigger }
      },
    },
    {
      name: 'list_routines',
      description: 'List routines: yours, or another bot\'s.',
      input: { bot: z.string().max(80).optional() },
      readOnly: true,
      handler(args) {
        return {
          routines: listRoutines(db, args.bot ? String(args.bot) : agent).map((r) => ({
            id: r.id, bot: r.bot, name: r.name, schedule: r.schedule, trigger: r.trigger, enabled: r.enabled,
            next_run_at: r.next_run_at ? new Date(r.next_run_at * 1000).toISOString() : null,
            last_run_at: r.last_run_at ? new Date(r.last_run_at * 1000).toISOString() : null,
          })),
        }
      },
    },
    {
      name: 'cancel_routine',
      description: 'Delete a routine (yours; coordinators may delete any).',
      input: { id: z.number().int().positive() },
      readOnly: false,
      handler(args) {
        const routine = getRoutine(db, Number(args.id))
        if (!routine) throw new ToolError(`no routine #${String(args.id)}`)
        if (!mayManage(routine.bot)) throw new ToolError('that routine belongs to another bot')
        deleteRoutine(db, routine.id)
        wrote()
        return { deleted: routine.id }
      },
    },
    {
      name: 'close_goal',
      description: 'Orchestrator only: close a goal the user gave, as done (its done-when condition holds) or dropped (it cannot be reached), with a summary of what was done and the evidence. The user is told.',
      input: { id: z.number().int().positive(), status: z.enum(['done', 'dropped']), summary: z.string().min(1).max(4000) },
      readOnly: false,
      handler(args) {
        if (agent !== ORCHESTRATOR) throw new ToolError('only the orchestrator closes goals')
        const goal = getGoal(db, Number(args.id))
        if (!goal) throw new ToolError(`no goal #${String(args.id)}`)
        const closed = closeGoal(db, goal.id, args.status as 'done' | 'dropped', String(args.summary))
        if (!closed) throw new ToolError(`goal #${goal.id} is already ${goal.status}`)
        postMessage(db, { sender: agent, recipient: 'user', body: `Goal #${goal.id} ${closed.status}: ${goal.objective}\n\n${String(args.summary)}` })
        wrote()
        return { id: goal.id, status: closed.status }
      },
    },
  ]
}
