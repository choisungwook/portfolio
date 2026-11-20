import { z } from 'zod'
import { getAgent, postMessage, ORCHESTRATOR } from '../db/team.ts'
import { closeGoal, getGoal } from '../db/goals.ts'
import { ToolError, type ScopedTools, type TeamTool } from './tools.ts'

// Tools for work that runs without the user in the loop each time: closing a goal and reviewing another bot's result.

const TASK_ID = z.string().regex(/^[0-9a-f]{8}$/)

export function autonomyTools(scope: ScopedTools): TeamTool[] {
  const { db, agent, wrote } = scope
  return [
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
