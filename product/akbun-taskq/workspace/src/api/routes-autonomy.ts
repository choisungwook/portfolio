import type { Hono } from 'hono'
import { decideApprovalRequest, openApprovals } from '../db/bot-requests.ts'
import { closeGoal, createGoal, getGoal, listGoals } from '../db/goals.ts'
import { getAgent, ORCHESTRATOR, postMessage, USER } from '../db/team.ts'
import { weeklyReview } from '../team/review.ts'
import { workflowFromTask } from '../team/workflow-from-task.ts'
import { teamChanged } from '../wake.ts'
import { HttpError, optionalJson, type ApiDeps } from './http.ts'

// What bots wait on the user for (approvals), goals, the weekly review, and saving a finished task
// as a workflow. Paths stay out of /bots/:name so a bot cannot be named after them.
export function registerAutonomyRoutes(api: Hono, { db }: ApiDeps): void {
  const idOf = (value: string) => {
    const id = Number(value)
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'bad id')
    return id
  }

  api.get('/bot-approvals', (c) => c.json(openApprovals(db)))
  // { approve: true|false }: an approved request lets that exact call run once; the bot is told either way.
  api.post('/bot-approvals/:id', async (c) => {
    const body = await optionalJson(c)
    if (typeof body.approve !== 'boolean') throw new HttpError(400, 'approve must be true or false')
    const done = decideApprovalRequest(db, idOf(c.req.param('id')), body.approve)
    if (!done) throw new HttpError(409, 'that request is not waiting any more')
    return c.json(done)
  })

  api.get('/goals', (c) => c.json(listGoals(db)))
  // { objective, done_when }: the orchestrator gets the goal and splits it.
  api.post('/goals', async (c) => {
    const body = await optionalJson(c)
    const objective = typeof body.objective === 'string' ? body.objective.trim() : ''
    const doneWhen = typeof body.done_when === 'string' ? body.done_when.trim() : ''
    if (!objective || !doneWhen) throw new HttpError(400, 'a goal needs an objective and a done-when condition')
    const goal = createGoal(db, objective, doneWhen)
    teamChanged.notify()
    return c.json(goal, 201)
  })
  // The user drops a goal (or marks it done) themselves: { status: done|dropped, summary }
  api.post('/goals/:id/close', async (c) => {
    const body = await optionalJson(c)
    const status = body.status === 'done' ? 'done' : body.status === 'dropped' ? 'dropped' : null
    if (!status) throw new HttpError(400, 'status must be done or dropped')
    const id = idOf(c.req.param('id'))
    if (!getGoal(db, id)) throw new HttpError(404, 'no such goal')
    const closed = closeGoal(db, id, status, typeof body.summary === 'string' ? body.summary : 'closed by the user')
    if (!closed) throw new HttpError(409, 'that goal is already closed')
    postMessage(db, { sender: USER, recipient: ORCHESTRATOR, body: `I closed goal #${id} as ${status}: ${closed.objective}. Stop work that was only for it and tell its bots.` })
    teamChanged.notify()
    return c.json(closed)
  })

  // ?days=7: per bot and routine, whether it ran and went well, what to prune, and results to check by hand.
  api.get('/review', (c) => {
    const days = Number(c.req.query('days') ?? 7)
    if (!Number.isInteger(days) || days < 1 || days > 90) throw new HttpError(400, 'days must be 1 to 90')
    return c.json(weeklyReview(db, days))
  })

  api.post('/tasks/:id/save-workflow', (c) => {
    const made = workflowFromTask(db, c.req.param('id'))
    if (typeof made === 'string') throw new HttpError(made === 'task not found' ? 404 : 409, made)
    return c.json(made, 201)
  })
}
