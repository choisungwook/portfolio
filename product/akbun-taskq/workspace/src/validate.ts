import { existsSync, statSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'
import type { TaskData, TaskStatus, TaskType } from './types.ts'

export const TASK_TYPES: TaskType[] = ['ops_read', 'ops_change', 'code', 'research', 'security_review']

export interface TaskInput {
  type: TaskType
  status: 'draft' | 'ready'
  priority: number
  lock_key: string | null
  data: TaskData
  depends_on: string[]
  worktree?: boolean   // for a code task in a git repository: work in a new worktree (default true)
}

export interface TaskPatch {
  priority?: number
  status?: TaskStatus
  data: Partial<TaskData>
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

// Answers whether a name is a registered access skill. The API and the CLI pass the database lookup.
export type SkillLookup = (name: string) => boolean

type Obj = Record<string, unknown>

class InputError extends Error {}

const TEXT_LIMIT = 4000
const ID_PATTERN = /^[0-9a-f]{8}$/

function asObject(body: unknown): Obj {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new InputError('body must be a JSON object')
  return body as Obj
}

function optText(value: unknown, key: string, limit = TEXT_LIMIT): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.length > limit) throw new InputError(`${key} must be a string up to ${limit} characters`)
  return value
}

function optBool(value: unknown, key: string): boolean | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') throw new InputError(`${key} must be true or false`)
  return value
}

function requiredText(value: unknown, key: string): string {
  const text = optText(value, key)?.trim()
  if (!text) throw new InputError(`${key} must be a non-empty string`)
  return text
}

function optInt(value: unknown, key: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null) return undefined
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new InputError(`${key} must be an integer from ${min} to ${max}`)
  }
  return value as number
}

function optNumber(value: unknown, key: string, max: number): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !(value > 0) || value > max) throw new InputError(`${key} must be a number above 0 up to ${max}`)
  return value
}

// output_path is checked lexically against a fixed root, so '..' and absolute paths are rejected without touching the disk.
const OUTPUT_ROOT = '/outputs'

function checkPaths(data: Partial<TaskData>): void {
  if (data.output_path !== undefined && (isAbsolute(data.output_path) || !resolve(OUTPUT_ROOT, data.output_path).startsWith(OUTPUT_ROOT + sep))) {
    throw new InputError('output_path must be a relative path inside outputs/')
  }
  if (data.repo !== undefined && (!isAbsolute(data.repo) || !existsSync(data.repo) || !statSync(data.repo).isDirectory())) {
    throw new InputError('repo must be an absolute path to an existing directory')
  }
}

// Attachments are paths the upload API returned, relative to the shared folder. Only the form is checked here; the
// worker reads them through the gate, which confines reads to that folder.
function optAttachments(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.length > 20) throw new InputError('attachments must be an array of up to 20 paths')
  for (const path of value) {
    if (typeof path !== 'string' || path.length > 300 || isAbsolute(path) || path.split('/').includes('..') || !path.startsWith('attachments/')) {
      throw new InputError('attachments must be paths under attachments/ returned by the upload')
    }
  }
  return value.length ? value as string[] : undefined
}

function optIds(value: unknown, key: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 50) throw new InputError(`${key} must be an array of up to 50 task ids`)
  for (const id of value) {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new InputError(`${key} contains an invalid task id`)
  }
  return value as string[]
}

function checkSkill(value: string | undefined, known: SkillLookup): void {
  if (value !== undefined && !known(value)) {
    throw new InputError(`access_skill ${value} is not registered; register it in Settings or with taskq skills add <path>`)
  }
}

// Shared by the API (POST /tasks) and the CLI (add) so both reject the same input.
export function parseTaskInput(body: unknown, known: SkillLookup): Parsed<TaskInput> {
  try {
    const o = asObject(body)
    const type = o.type
    if (typeof type !== 'string' || !TASK_TYPES.includes(type as TaskType)) {
      throw new InputError(`type must be one of ${TASK_TYPES.join(', ')}`)
    }
    if (o.status !== undefined && o.status !== 'draft' && o.status !== 'ready') throw new InputError('status must be draft or ready')
    const data: TaskData = { intent: requiredText(o.intent, 'intent') }
    data.title = optText(o.title, 'title', 200)
    data.cautions = optText(o.cautions, 'cautions')
    data.access_skill = optText(o.access_skill, 'access_skill', 100)
    checkSkill(data.access_skill, known)
    data.target_profile = optText(o.target_profile, 'target_profile', 100)
    data.repo = optText(o.repo, 'repo', 500)
    data.output_path = optText(o.output_path, 'output_path', 500)
    if (o.auto_accept_handoffs !== undefined && typeof o.auto_accept_handoffs !== 'boolean') {
      throw new InputError('auto_accept_handoffs must be a boolean')
    }
    data.auto_accept_handoffs = o.auto_accept_handoffs
    data.attachments = optAttachments(o.attachments)
    data.workflow_id = optText(o.workflow_id, 'workflow_id', 100) || undefined
    data.review_required = optBool(o.review_required, 'review_required') || undefined
    data.max_turns = optInt(o.max_turns, 'max_turns', 1, 1000)
    data.max_budget_usd = optNumber(o.max_budget_usd, 'max_budget_usd', 100)
    checkPaths(data)
    return {
      ok: true,
      value: {
        type: type as TaskType,
        status: o.status === 'ready' ? 'ready' : 'draft',
        priority: optInt(o.priority, 'priority', -100, 100) ?? 0,
        lock_key: optText(o.lock_key, 'lock_key', 100) ?? null,
        data,
        depends_on: optIds(o.depends_on, 'depends_on'),
        worktree: optBool(o.worktree, 'worktree'),
      },
    }
  } catch (error) {
    if (error instanceof InputError) return { ok: false, error: error.message }
    throw error
  }
}

// PATCH /tasks/:id. Only draft -> ready is a status change here; other transitions have their own routes.
export function parseTaskPatch(body: unknown, known: SkillLookup): Parsed<TaskPatch> {
  try {
    const o = asObject(body)
    if (o.status !== undefined && o.status !== 'ready') throw new InputError('status can only be set to ready')
    const data: Partial<TaskData> = {}
    if (o.intent !== undefined) data.intent = requiredText(o.intent, 'intent')
    data.title = optText(o.title, 'title', 200)
    data.cautions = optText(o.cautions, 'cautions')
    data.access_skill = optText(o.access_skill, 'access_skill', 100)
    checkSkill(data.access_skill, known)
    data.target_profile = optText(o.target_profile, 'target_profile', 100)
    data.repo = optText(o.repo, 'repo', 500)
    data.output_path = optText(o.output_path, 'output_path', 500)
    // null or '' removes the workflow from the task.
    if (o.workflow_id !== undefined) data.workflow_id = optText(o.workflow_id, 'workflow_id', 100) ?? ''
    if (o.review_required !== undefined) data.review_required = optBool(o.review_required, 'review_required')
    checkPaths(data)
    return {
      ok: true,
      value: {
        priority: optInt(o.priority, 'priority', -100, 100),
        status: o.status === 'ready' ? 'ready' : undefined,
        data,
      },
    }
  } catch (error) {
    if (error instanceof InputError) return { ok: false, error: error.message }
    throw error
  }
}
