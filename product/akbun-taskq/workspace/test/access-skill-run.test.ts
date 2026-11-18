import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerSkill } from '../src/skills/registry.ts'
import { getTask } from '../src/db/tasks.ts'
import { listRunsOfTask } from '../src/db/runs.ts'
import { buildPrompt } from '../src/worker/prompt.ts'
import type { WorkerContext } from '../src/types.ts'
import { addTask, fakeWorker, result, setup, startRunner, stopRunners, waitFor, type TestEnv } from './helpers.ts'

const skillsRoot = mkdtempSync(join(tmpdir(), 'access-skill-run-'))

function skillDir(name: string): string {
  const dir = join(skillsRoot, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Example\n---\n`)
  return dir
}

describe('access skill at run time', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(async () => {
    await stopRunners()
    env.cleanup()
  })

  test('a run whose access skill lost its SKILL.md fails before any session starts', async () => {
    const { db, config } = env
    const dir = skillDir('example-gone')
    registerSkill(db, env.home, dir)
    const task = addTask(db, { data: { intent: 'use the skill', access_skill: 'example-gone' } })
    rmSync(join(dir, 'SKILL.md'))
    let calls = 0
    await startRunner({ db, config, worker: fakeWorker(() => { calls += 1; return result('done') }) }).start()
    await waitFor(() => getTask(db, task.id)!.status === 'failed')
    assert.equal(calls, 0)
    const [run] = listRunsOfTask(db, task.id)
    assert.equal(run.summary, `access skill example-gone is missing at ${realpathSync(dir)}`)
  })

  test('a registered access skill reaches the worker as access_skill_path', async () => {
    const { db, config } = env
    const dir = skillDir('example-readonly')
    registerSkill(db, env.home, dir)
    const task = addTask(db, { data: { intent: 'use the skill', access_skill: 'example-readonly' } })
    const seen: (string | undefined)[] = []
    await startRunner({
      db, config,
      worker: fakeWorker((ctx: WorkerContext) => { seen.push(ctx.access_skill_path); return result('done') }),
    }).start()
    await waitFor(() => getTask(db, task.id)!.status === 'review')
    assert.deepEqual(seen, [realpathSync(dir)])
  })

  test('the prompt names the skill and its folder, and omits the folder when none is given', () => {
    const task = addTask(env.db, { data: { intent: 'x', access_skill: 'example-readonly' } })
    const context = { task, similar: [], handoffs: [] }
    const withPath = buildPrompt({ ...context, access_skill_path: '/skills/example-readonly' }, '/outputs')
    assert.match(withPath, /use the skill named example-readonly to reach the target account\. Its files are in \/skills\/example-readonly; read \/skills\/example-readonly\/SKILL\.md/)
    assert.doesNotMatch(buildPrompt(context, '/outputs'), /Its files are in/)
    const noSkill = addTask(env.db, { data: { intent: 'y' } })
    assert.doesNotMatch(buildPrompt({ ...context, task: noSkill }, '/outputs'), /skill named/)
  })
})
