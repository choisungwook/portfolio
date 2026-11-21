import type { Hono } from 'hono'
import { createFromInput, getTask, listTasks, moveStatus, patchData, setPriority, workflowIdOf } from '../db/tasks.ts'
import type { Context } from 'hono'
import { ApprovalError, decideApproval } from '../db/approvals.ts'
import { taskDetail } from '../db/detail.ts'
import { parseTaskInput, parseTaskPatch } from '../validate.ts'
import { hasAccessSkill } from '../skills/registry.ts'
import { HttpError, optionalJson, readJson, requireOk, type ApiDeps } from './http.ts'
import { deleteTask, OperatorError, prepareRun, requestCancel, retryTask } from '../db/operator.ts'
import { noRunControl } from '../runner/control.ts'
import { enumParam, TASK_STATUSES } from './params.ts'

const LOCKED_FOR_EDIT = ['running', 'needs_approval']

export function registerTaskRoutes(api: Hono, { db, config, control = noRunControl }: ApiDeps): void {
  api.get('/tasks', (c) => c.json(listTasks(db, enumParam(c.req.query('status'), 'status', TASK_STATUSES))))

  api.post('/tasks', async (c) => {
    const input = requireOk(parseTaskInput(await readJson(c), (name) => hasAccessSkill(db, name)))
    try {
      return c.json(createFromInput(db, input, null, config), 201)
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : String(error))
    }
  })

  api.get('/tasks/:id', (c) => {
    const detail = taskDetail(db, c.req.param('id'))
    return detail ? c.json(detail) : c.json({ error: 'task not found' }, 404)
  })

  api.patch('/tasks/:id', async (c) => {
    const id = c.req.param('id')
    const patch = requireOk(parseTaskPatch(await readJson(c), (name) => hasAccessSkill(db, name)))
    const task = getTask(db, id)
    if (!task) return c.json({ error: 'task not found' }, 404)
    // Editing what the task asks for is locked while a run is working on it; stopped or failed tasks can be edited.
    const edits = 'intent' in patch.data || 'title' in patch.data
    if (edits && LOCKED_FOR_EDIT.includes(task.status)) throw new HttpError(409, `task is ${task.status}; stop it before editing`)
    if (patch.status === 'ready' && !moveStatus(db, id, 'draft', 'ready')) throw new HttpError(409, 'only draft tasks can be made ready')
    if (patch.data.workflow_id) {
      try {
        patch.data.workflow_id = workflowIdOf(db, patch.data.workflow_id)
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : String(error))
      }
    }
    if (patch.priority !== undefined) setPriority(db, id, patch.priority)
    if (Object.keys(patch.data).length > 0) patchData(db, id, patch.data)
    return c.json(getTask(db, id))
  })

  // Delete a task that no run is working on (cancel a running one first); 409 otherwise.
  api.delete('/tasks/:id', (c) => {
    try {
      deleteTask(db, c.req.param('id'))
    } catch (error) {
      if (error instanceof OperatorError) throw new HttpError(error.message === 'task not found' ? 404 : 409, error.message)
      throw error
    }
    return c.json({ deleted: true })
  })

  api.post('/tasks/:id/approve', async (c) => c.json(await decide(c, db, true)))
  api.post('/tasks/:id/deny', async (c) => c.json(await decide(c, db, false)))

  api.post('/tasks/:id/resume', (c) => {
    const id = c.req.param('id')
    if (!moveStatus(db, id, 'needs_auth', 'ready')) throw new HttpError(409, 'task is not waiting for login')
    return c.json(getTask(db, id))
  })

  api.post('/tasks/:id/done', (c) => {
    const id = c.req.param('id')
    if (!moveStatus(db, id, 'review', 'done')) throw new HttpError(409, 'task is not in review')
    return c.json(getTask(db, id))
  })

  // A running task stops when its runner polls the marker. A needs_auth task, or one with no live runner, ends here.
  api.post('/tasks/:id/cancel', (c) => {
    const id = c.req.param('id')
    if (!getTask(db, id)) return c.json({ error: 'task not found' }, 404)
    try {
      return c.json(requestCancel(db, config, id))
    } catch (error) {
      if (error instanceof OperatorError) throw new HttpError(409, error.message)
      throw error
    }
  })

  // Run now: any status but running and needs_approval. The task becomes ready and the runner claims it first.
  api.post('/tasks/:id/run', (c) => {
    const id = c.req.param('id')
    if (!getTask(db, id)) return c.json({ error: 'task not found' }, 404)
    try {
      const task = prepareRun(db, id)
      control.runNow(id)
      return c.json(task)
    } catch (error) {
      if (error instanceof OperatorError) throw new HttpError(409, error.message)
      throw error
    }
  })

  // Only a failed or cancelled task can be retried, always in a new session. draft: true puts it back as a draft.
  api.post('/tasks/:id/retry', async (c) => {
    const id = c.req.param('id')
    if (!getTask(db, id)) return c.json({ error: 'task not found' }, 404)
    const body = await optionalJson(c)
    const options = { draft: body.draft === true }
    if (!retryTask(db, id, options)) throw new HttpError(409, 'only failed or cancelled tasks can be retried')
    return c.json(getTask(db, id))
  })
}

// The body names the request the user saw. Anything but the task's open request is a 409.
async function decide(c: Context, db: ApiDeps['db'], approve: boolean) {
  const id = c.req.param('id') as string
  const body = await readJson(c)
  const requestId = typeof body === 'object' && body !== null ? (body as { request_id?: unknown }).request_id : undefined
  if (typeof requestId !== 'string' || requestId === '') throw new HttpError(400, 'request_id is required')
  try {
    decideApproval(db, id, requestId, approve)
  } catch (error) {
    if (error instanceof ApprovalError) throw new HttpError(409, error.message)
    throw error
  }
  return getTask(db, id)
}
