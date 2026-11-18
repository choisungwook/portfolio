import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveConfig } from '../src/config.ts'
import { createSdkWorker } from '../src/agents/claude/worker.ts'
import type { Task, WorkerContext } from '../src/types.ts'
import { fakeQuery, hookOf, init, success } from './fake-query.ts'

// The access skill folder reaches the prompt and the PreToolUse gate of an ops_change session.
const home = mkdtempSync(join(tmpdir(), 'access-skill-worker-'))
after(() => rmSync(home, { recursive: true, force: true }))
const config = resolveConfig(home)
const skillDir = join(home, 'example-readonly')
mkdirSync(skillDir)

const task: Task = {
  id: 't-7', type: 'ops_change', status: 'running', priority: 0, lock_key: null, claimed_by: null, heartbeat_at: null, owner: null,
  session_id: null, data: { intent: 'check the example account', access_skill: 'example-readonly' }, created_at: 0, updated_at: 0,
}

function ctxWith(access_skill_path?: string): WorkerContext {
  return {
    task, runId: 'run-7', resumeSessionId: null, similar: [], handoffs: [], signal: new AbortController().signal, access_skill_path,
    emit: () => {}, onSession: () => {}, patchData: () => {}, requestApproval: async () => true,
  }
}

const toolCall = (tool_name: string, file_path: string) => ({
  hook_event_name: 'PreToolUse', tool_name, tool_input: { file_path }, tool_use_id: 'tu-7',
})

describe('access skill in the worker', () => {
  test('the prompt carries the folder, and the gate denies writes there and allows reads', async () => {
    const { query, prompts, calls } = fakeQuery(() => [init('sess-7'), success({ outcome: 'done', summary: 'ok', alerts: [], followups: [] })])
    await createSdkWorker(config, { query })(ctxWith(realpathSync(skillDir)))
    assert.match(prompts[0], new RegExp(`Its files are in ${realpathSync(skillDir)}`))
    const pre = hookOf(calls[0], 'PreToolUse')
    const decide = async (tool: string, path: string) => {
      const out = await pre(toolCall(tool, path) as never, 'tu-7', { signal: new AbortController().signal }) as
        { hookSpecificOutput?: { permissionDecision?: string } }
      return out.hookSpecificOutput?.permissionDecision ?? 'allow-by-default'
    }
    assert.equal(await decide('Write', join(skillDir, 'new.md')), 'deny')
    assert.notEqual(await decide('Read', join(skillDir, 'SKILL.md')), 'deny')
  })

  test('without a resolved folder the prompt names only the skill and a write there asks', async () => {
    const { query, prompts, calls } = fakeQuery(() => [init('sess-8'), success({ outcome: 'done', summary: 'ok', alerts: [], followups: [] })])
    await createSdkWorker(config, { query })(ctxWith(undefined))
    assert.doesNotMatch(prompts[0], /Its files are in/)
    const out = await hookOf(calls[0], 'PreToolUse')(toolCall('Write', join(skillDir, 'new.md')) as never, 'tu-8', { signal: new AbortController().signal }) as
      { hookSpecificOutput?: { permissionDecision?: string } }
    assert.equal(out.hookSpecificOutput?.permissionDecision, 'ask')
  })
})
