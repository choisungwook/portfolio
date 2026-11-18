import type { Hono } from 'hono'
import { answerApproval, getRun, getWorkflow, listRuns, listWorkflows, parseDefinition, createWorkflow, updateWorkflow, type WorkflowDefinition } from '../db/workflows.ts'
import { afterUserStep, cancelWorkflowRun, removeWorkflow, startWorkflowFor } from '../team/workflow-work.ts'
import { intParam } from './params.ts'
import { HttpError, optionalJson, readJson, type ApiDeps } from './http.ts'

// Workflows the user defines and bots execute, and their run history.

function parseWorkflowBody(body: unknown): { name: string; description: string; definition: WorkflowDefinition } {
  const o = (body ?? {}) as Record<string, unknown>
  const name = typeof o.name === 'string' ? o.name.trim() : ''
  if (!name || name.length > 80) throw new HttpError(400, 'name must be 1 to 80 characters')
  const description = typeof o.description === 'string' ? o.description.slice(0, 1000) : ''
  const parsed = parseDefinition(o.definition)
  if (!parsed.ok) throw new HttpError(400, parsed.error)
  return { name, description, definition: parsed.value }
}

function saving<T>(fn: () => T): T {
  try {
    return fn()
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new HttpError(409, 'a workflow with that name exists')
    throw error
  }
}

export function registerWorkflowRoutes(api: Hono, { db }: ApiDeps): void {
  api.get('/workflows', (c) => c.json(listWorkflows(db, c.req.query('deleted') === '1')))

  api.post('/workflows', async (c) => {
    const input = parseWorkflowBody(await readJson(c))
    return c.json(saving(() => createWorkflow(db, input)), 201)
  })

  api.get('/workflow-runs', (c) => c.json(listRuns(db, {
    workflowId: c.req.query('workflow') || undefined, bot: c.req.query('bot') || undefined, taskId: c.req.query('task') || undefined,
    limit: intParam(c.req.query('limit'), 'limit', 50, 1, 200),
  })))

  api.get('/workflow-runs/:id', (c) => {
    const run = getRun(db, c.req.param('id'))
    if (!run) throw new HttpError(404, 'no such workflow run')
    return c.json(run)
  })

  api.post('/workflow-runs/:id/cancel', (c) => {
    if (!cancelWorkflowRun(db, c.req.param('id'))) throw new HttpError(409, 'the run is not running')
    return c.json(getRun(db, c.req.param('id')))
  })

  // The user's answer to an approval step: { "approved": true|false, "note": "..." }.
  api.post('/workflow-runs/:id/steps/:step/approve', async (c) => {
    const body = await optionalJson(c)
    if (typeof body.approved !== 'boolean') throw new HttpError(400, 'approved must be true or false')
    const result = answerApproval(db, c.req.param('id'), c.req.param('step'), body.approved, typeof body.note === 'string' ? body.note.slice(0, 1000) : '')
    if (!result.ok) throw new HttpError(409, result.error)
    afterUserStep(db, result.run, c.req.param('step'))
    return c.json(result.run)
  })

  api.get('/workflows/:id', (c) => {
    const workflow = getWorkflow(db, c.req.param('id'))
    if (!workflow) throw new HttpError(404, 'no such workflow')
    return c.json(workflow)
  })

  api.put('/workflows/:id', async (c) => {
    const current = getWorkflow(db, c.req.param('id'))
    if (!current || current.deleted_at !== null) throw new HttpError(404, 'no such workflow')
    const input = parseWorkflowBody(await readJson(c))
    return c.json(saving(() => updateWorkflow(db, current.id, input)))
  })

  // Soft delete. Runs keep their copy and show the workflow as deleted; bots running it are told.
  api.delete('/workflows/:id', (c) => {
    const workflow = getWorkflow(db, c.req.param('id'))
    if (!workflow || workflow.deleted_at !== null) throw new HttpError(404, 'no such workflow')
    return c.json(removeWorkflow(db, workflow))
  })

  // Starts a run executed by `bot`, optionally for a task. Usually a run starts when a bot starts a task that has the
  // workflow; this is the direct way, from the Workflows view or the CLI.
  api.post('/workflows/:id/run', async (c) => {
    const body = await optionalJson(c)
    if (typeof body.bot !== 'string' || !body.bot) throw new HttpError(400, 'bot is required: the bot that executes the run')
    const started = startWorkflowFor(db, c.req.param('id'), body.bot, typeof body.task_id === 'string' ? body.task_id : null)
    if (!started.ok) throw new HttpError(400, started.error)
    return c.json(started.run, 201)
  })
}
