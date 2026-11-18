import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/api/server.ts'
import { listMessages } from '../src/db/team.ts'
import { createWorkflow, getRun, listRuns, parseDefinition, type WorkflowDefinition } from '../src/db/workflows.ts'
import { getTask, nextEligible, createFromInput } from '../src/db/tasks.ts'
import { teamTools } from '../src/team/tools.ts'
import { hybridSearch } from '../src/team/search.ts'
import { seedTestBots, setup, TOKEN, type TestEnv } from './helpers.ts'

const RELEASE: WorkflowDefinition = {
  steps: [
    { id: 'build', name: 'Build', kind: 'do', instructions: 'npm run build', needs: [] },
    { id: 'test', name: 'Test', kind: 'check', instructions: 'npm test', needs: ['build'] },
    { id: 'ok', name: 'User approves', kind: 'approval', instructions: '', needs: ['test'] },
  ],
}

describe('workflows', () => {
  let env: TestEnv
  test.beforeEach(async () => {
    env = setup()
    await seedTestBots(env.db)
  })
  test.afterEach(() => env.cleanup())

  const tool = (agent: string, name: string) => {
    const found = teamTools({ db: env.db, config: env.config, agent, search: hybridSearch(env.db) }).find((t) => t.name === name)!
    return (args: Record<string, unknown>) => found.handler(args)
  }
  const headers = { 'x-taskq-token': TOKEN, 'content-type': 'application/json' }
  const call = (method: string, path: string, body?: unknown) =>
    createApp({ db: env.db, config: env.config }, TOKEN).request(`/api${path}`, {
      method, headers: { ...headers, host: `127.0.0.1:${env.config.port}` }, body: body === undefined ? undefined : JSON.stringify(body),
    })

  test('a definition with a loop, an unknown need or a handoff without a bot is refused', () => {
    const step = (id: string, needs: string[], extra = {}) => ({ id, name: id, kind: 'do', needs, ...extra })
    assert.match((parseDefinition({ steps: [step('a', ['b']), step('b', ['a'])] }) as { error: string }).error, /loop/)
    assert.match((parseDefinition({ steps: [step('a', ['x'])] }) as { error: string }).error, /unknown step x/)
    assert.match((parseDefinition({ steps: [step('a', [], { kind: 'handoff' })] }) as { error: string }).error, /names the bot/)
    assert.match((parseDefinition({ steps: [] }) as { error: string }).error, /at least one/)
    assert.equal(parseDefinition(RELEASE).ok, true)
    const placed = parseDefinition({ steps: [{ ...step('a', []), position: { x: 10.4, y: 'x' } }, { ...step('b', ['a']), position: { x: 300, y: 40 } }] })
    assert.deepEqual(placed.ok && placed.value.steps.map((s) => s.position), [undefined, { x: 300, y: 40 }], 'the editor\'s node positions are kept; a bad one is dropped')
  })

  test('[critical] a task with a workflow is done only when taskq says the run succeeded', async () => {
    const workflow = createWorkflow(env.db, { name: 'release', definition: RELEASE })
    const task = createFromInput(env.db, { type: 'code', status: 'ready', priority: 0, lock_key: null, data: { intent: 'ship it', workflow_id: 'release' }, depends_on: [] }, 'coder')
    assert.equal(task.data.workflow_id, workflow.id, 'stored by id')
    const started = tool('coder', 'start_task')({ task_id: task.id }) as { workflow_run_id: string; workflow: string }
    const runId = started.workflow_run_id
    assert.match(started.workflow, /\[ready\] build/)
    const step = tool('coder', 'workflow_step')
    const finish = tool('coder', 'finish_task')
    assert.throws(() => finish({ task_id: task.id, outcome: 'done', summary: 'done' }), /has not succeeded; steps left: build/)
    assert.throws(() => step({ run_id: runId, step_id: 'test', status: 'running' }), /needs build to finish first/)
    assert.throws(() => tool('planner', 'workflow_step')({ run_id: runId, step_id: 'build', status: 'running' }), /executed by coder/)
    step({ run_id: runId, step_id: 'build', status: 'succeeded', output: 'built' })
    assert.throws(() => step({ run_id: runId, step_id: 'test', status: 'succeeded', output: 'fine' }), /evidence/)
    step({ run_id: runId, step_id: 'test', status: 'succeeded', output: 'fine', evidence: '$ npm test\n# pass 10' })
    assert.throws(() => step({ run_id: runId, step_id: 'ok', status: 'succeeded' }), /user's approval/)
    step({ run_id: runId, step_id: 'ok', status: 'running', output: 'asked the user' })
    assert.equal(getRun(env.db, runId)?.status, 'running')
    const res = await call('POST', `/workflow-runs/${runId}/steps/ok/approve`, { approved: true, note: 'go' })
    assert.equal(res.status, 200)
    assert.equal(getRun(env.db, runId)?.status, 'succeeded')
    assert.ok(listMessages(env.db, { recipient: 'coder', limit: 5 }).some((m) => m.body.includes('answered step ok')))
    finish({ task_id: task.id, outcome: 'done', summary: 'shipped' })
    assert.equal(getTask(env.db, task.id)?.status, 'done')
  })

  test('[critical] a failed step fails the run, and finishing the task as failed ends a running run', () => {
    createWorkflow(env.db, { name: 'release', definition: RELEASE })
    const task = createFromInput(env.db, { type: 'code', status: 'ready', priority: 0, lock_key: null, data: { intent: 'x', workflow_id: 'release' }, depends_on: [] }, 'coder')
    const { workflow_run_id: runId } = tool('coder', 'start_task')({ task_id: task.id }) as { workflow_run_id: string }
    const out = tool('coder', 'workflow_step')({ run_id: runId, step_id: 'build', status: 'failed', output: 'tsc error' }) as { run_status: string }
    assert.equal(out.run_status, 'failed')
    const run = getRun(env.db, runId)!
    assert.deepEqual(run.steps.map((s) => s.status), ['failed', 'skipped', 'skipped'])
    tool('coder', 'finish_task')({ task_id: task.id, outcome: 'failed', summary: 'build broke' })
    assert.equal(getTask(env.db, task.id)?.status, 'failed')
  })

  test('[critical] a deleted workflow stays in the history marked deleted, and the bot running it is told', async () => {
    const created = await (await call('POST', '/workflows', { name: 'release', definition: RELEASE })).json() as { id: string }
    assert.equal((await call('POST', '/workflows', { name: 'release', definition: RELEASE })).status, 409)
    const run = await (await call('POST', `/workflows/${created.id}/run`, { bot: 'reviewer' })).json() as { id: string; bot: string }
    assert.equal(run.bot, 'reviewer')
    const removed = await (await call('DELETE', `/workflows/${created.id}`)).json() as { deleted: boolean; told: string[] }
    assert.deepEqual(removed, { deleted: true, told: ['reviewer'] })
    const runs = await (await call('GET', '/workflow-runs')).json() as { id: string; bot: string; workflow_deleted: boolean; status: string }[]
    assert.deepEqual(runs.map((r) => [r.bot, r.workflow_deleted, r.status]), [['reviewer', true, 'running']])
    assert.ok(listMessages(env.db, { recipient: 'reviewer', limit: 5 }).some((m) => m.body.includes('deleted workflow "release"')))
    const status = tool('reviewer', 'workflow_status')({ run_id: run.id }) as { workflow_deleted: boolean }
    assert.equal(status.workflow_deleted, true)
    assert.deepEqual(await (await call('GET', '/workflows')).json(), [])
    assert.equal(((await (await call('GET', '/workflows?deleted=1')).json()) as unknown[]).length, 1)
    assert.equal((await call('POST', `/workflows/${created.id}/run`, { bot: 'reviewer' })).status, 400)
    assert.equal((await call('POST', `/workflow-runs/${run.id}/cancel`)).status, 200)
    assert.equal(listRuns(env.db)[0].status, 'cancelled')
  })

  test('[critical] a bot cannot skip a check or an approval, nor close a task whose run failed or a blocked start', async () => {
    createWorkflow(env.db, { name: 'release', definition: RELEASE })
    const task = createFromInput(env.db, { type: 'code', status: 'ready', priority: 0, lock_key: null, data: { intent: 'x', workflow_id: 'release' }, depends_on: [] }, 'coder')
    const { workflow_run_id: runId } = tool('coder', 'start_task')({ task_id: task.id }) as { workflow_run_id: string }
    const step = tool('coder', 'workflow_step')
    step({ run_id: runId, step_id: 'build', status: 'succeeded', output: 'ok' })
    assert.throws(() => step({ run_id: runId, step_id: 'test', status: 'skipped', output: 'not needed' }), /cannot be skipped/)
    assert.equal((await call('POST', `/workflow-runs/${runId}/cancel`)).status, 200)
    assert.throws(() => tool('coder', 'finish_task')({ task_id: task.id, outcome: 'done', summary: 'done' }), /cancelled .*outcome failed/)
    assert.equal((await call('POST', `/tasks/${task.id}/run`)).status, 409, 'run now refuses a workflow task')
    const blocker = createFromInput(env.db, { type: 'research', status: 'ready', priority: 0, lock_key: null, data: { intent: 'first' }, depends_on: [] })
    const later = createFromInput(env.db, { type: 'code', status: 'ready', priority: 0, lock_key: null, data: { intent: 'later', workflow_id: 'release' }, depends_on: [blocker.id] }, 'coder')
    assert.throws(() => tool('coder', 'start_task')({ task_id: later.id }), /depends on/)
    assert.equal(listRuns(env.db, { taskId: later.id }).length, 0, 'a refused start leaves no run behind')
  })

  test('the queue leaves a task with a workflow and no owner alone; only a bot executes workflows', () => {
    createWorkflow(env.db, { name: 'release', definition: RELEASE })
    createFromInput(env.db, { type: 'code', status: 'ready', priority: 0, lock_key: null, data: { intent: 'x', workflow_id: 'release' }, depends_on: [] })
    assert.equal(nextEligible(env.db), undefined)
  })

  test('a task cannot name a workflow that does not exist', async () => {
    const res = await call('POST', '/tasks', { type: 'research', intent: 'x', workflow_id: 'nope' })
    assert.equal(res.status, 400)
    assert.match(((await res.json()) as { error: string }).error, /unknown workflow/)
  })
})
