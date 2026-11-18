import { parseArgs } from 'node:util'
import { pauseQueue, resumeQueue } from '../db/meta.ts'
import { OperatorError, pauseReason, requestCancel, retryTask } from '../db/operator.ts'
import { getTask } from '../db/tasks.ts'
import type { Command } from './types.ts'

// Same rules as the API: pause reason, cancel and retry transitions. Errors are thrown and printed by main.
export const pause: Command = ({ db }, args) => {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: { reason: { type: 'string' } } })
  pauseQueue(db, pauseReason(values.reason), 'user')
  console.log('queue paused')
}

export const unpause: Command = ({ db }) => {
  resumeQueue(db)
  console.log('queue resumed')
}

export const cancel: Command = ({ config, db }, args) => {
  const id = requireId(args)
  const task = wrap(() => requestCancel(db, config, id))
  console.log(`${id} ${task.status}${task.status === 'cancelled' ? '' : ' (cancel requested; the runner stops it)'}`)
}

export const retry: Command = ({ db }, args) => {
  const { positionals, values } = parseArgs({
    args, strict: true, allowPositionals: true,
    options: { draft: { type: 'boolean' }, resume: { type: 'boolean' } },
  })
  const id = positionals[0]
  if (!id) throw new Error('task id is required')
  if (!getTask(db, id)) throw new Error(`task not found: ${id}`)
  if (!retryTask(db, id, { draft: values.draft === true, resume: values.resume === true })) {
    throw new Error('only failed tasks can be retried')
  }
  console.log(`${id} ${values.draft ? 'draft' : 'ready'}`)
}

function requireId(args: string[]): string {
  const id = args[0]
  if (!id) throw new Error('task id is required')
  return id
}

function wrap<T>(fn: () => T): T {
  try {
    return fn()
  } catch (error) {
    if (error instanceof OperatorError) throw new Error(error.message)
    throw error
  }
}
