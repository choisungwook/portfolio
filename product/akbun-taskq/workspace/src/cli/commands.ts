import { parseArgs } from 'node:util'
import { taskDetail } from '../db/detail.ts'
import { createFromInput, listTasks, moveStatus } from '../db/tasks.ts'
import { parseTaskInput } from '../validate.ts'
import { hasAccessSkill } from '../skills/registry.ts'
import type { Task } from '../types.ts'
import type { Command } from './types.ts'
import { decideFromCli, escapeControls } from './approvals.ts'

export const add: Command = ({ db }, args) => {
  const { values } = parseArgs({
    args, strict: true, allowPositionals: false,
    options: {
      type: { type: 'string' }, intent: { type: 'string' }, title: { type: 'string' },
      cautions: { type: 'string' }, 'access-skill': { type: 'string' }, 'target-profile': { type: 'string' },
      'lock-key': { type: 'string' }, repo: { type: 'string' }, output: { type: 'string' },
      priority: { type: 'string' }, 'depends-on': { type: 'string', multiple: true }, draft: { type: 'boolean' },
    },
  })
  const parsed = parseTaskInput({
    type: values.type, intent: values.intent, title: values.title, cautions: values.cautions,
    access_skill: values['access-skill'], target_profile: values['target-profile'], lock_key: values['lock-key'],
    repo: values.repo, output_path: values.output,
    priority: values.priority === undefined ? undefined : Number(values.priority),
    depends_on: values['depends-on'], status: values.draft ? 'draft' : 'ready',
  }, (name) => hasAccessSkill(db, name))
  if (!parsed.ok) throw new Error(parsed.error)
  const task = createFromInput(db, parsed.value)
  console.log(formatTask(task, false))
}

export const list: Command = ({ db }, args) => {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: { status: { type: 'string' } } })
  for (const task of listTasks(db, values.status)) console.log(formatTask(task, task.blocked))
}

export const show: Command = ({ db }, args) => {
  const id = requireId(args)
  const detail = taskDetail(db, id)
  if (!detail) throw new Error(`task not found: ${id}`)
  console.log(JSON.stringify(detail, null, 2))
  const pending = detail.pending_approval
  if (pending) {
    console.log(`pending approval ${pending.request_id}  tool ${pending.tool}  ${pending.bytes} bytes`)
    console.log(escapeControls(JSON.stringify(pending.input, null, 2) ?? 'null'))
  }
}

export const approve: Command = ({ db }, args) => decideFromCli(db, args, true)

export const deny: Command = ({ db }, args) => decideFromCli(db, args, false)

export const resume: Command = ({ db }, args) => {
  const id = requireId(args)
  if (!moveStatus(db, id, 'needs_auth', 'ready')) throw new Error('task is not waiting for login')
  console.log(`${id} ready`)
}

export const done: Command = ({ db }, args) => {
  const id = requireId(args)
  if (!moveStatus(db, id, 'review', 'done')) throw new Error('task is not in review')
  console.log(`${id} done`)
}

function requireId(args: string[]): string {
  const id = args[0]
  if (!id) throw new Error('task id is required')
  return id
}

function formatTask(task: Task, blocked: boolean): string {
  const title = task.data.title ?? task.data.intent
  return [task.id, task.status.padEnd(16), task.type.padEnd(16), `p${task.priority}`, blocked ? 'blocked' : '', title]
    .filter(Boolean).join('  ')
}

