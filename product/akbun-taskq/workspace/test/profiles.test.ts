import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { resolveConfig, type Config } from '../src/config.ts'
import { profileFor } from '../src/agents/claude/profiles.ts'
import type { Task, TaskData, TaskType } from '../src/types.ts'

const home = '/home/example-taskq'
const outputs = join(home, 'outputs')

function taskOf(type: TaskType, data: Partial<TaskData> = {}): Task {
  return {
    id: 't-1', type, status: 'running', priority: 0, lock_key: null, claimed_by: null, heartbeat_at: null,
    session_id: null, data: { intent: 'example intent', repo: '/work/example-repo', ...data }, created_at: 0, updated_at: 0,
  }
}

describe('profileFor', () => {
  const config: Config = resolveConfig(home)

  test('each type has its permission mode', () => {
    assert.equal(profileFor(taskOf('research'), config).permissionMode, 'auto')
    assert.equal(profileFor(taskOf('code'), config).permissionMode, 'auto')
    assert.equal(profileFor(taskOf('security_review'), config).permissionMode, 'dontAsk')
    assert.equal(profileFor(taskOf('ops_read'), config).permissionMode, 'dontAsk')
    assert.equal(profileFor(taskOf('ops_change'), config).permissionMode, 'default')
  })

  test('ops_change has no bare Bash allow rule', () => {
    const allowed = profileFor(taskOf('ops_change'), config).allowedTools ?? []
    assert.equal(allowed.includes('Bash'), false)
    assert.equal(allowed.some((rule) => rule.startsWith('Bash')), false)
  })

  test('ops_read allows read tools and aws Bash, and no bare Bash', () => {
    const profile = profileFor(taskOf('ops_read'), config)
    assert.deepEqual(profile.allowedTools, ['Read', 'Grep', 'Glob', 'Skill', 'Bash(aws *)'])
  })

  test('read-only and research work in outputs, not in the taskq home', () => {
    for (const type of ['research', 'ops_read', 'ops_change'] as TaskType[]) {
      assert.equal(profileFor(taskOf(type), config).cwd, outputs, type)
    }
  })

  test('security_review works in outputs and gets the repo as an additional directory', () => {
    const review = profileFor(taskOf('security_review', { review_of: 't-0', base_commit: 'abc' }), config)
    assert.equal(review.cwd, outputs)
    assert.deepEqual(review.additionalDirectories, ['/work/example-repo'])
    assert.equal(review.allowedTools?.includes('Bash'), false)
    assert.ok(review.allowedTools?.includes('Bash(git -C * diff *)'))
  })

  test('research and security_review write only under outputs', () => {
    assert.deepEqual(profileFor(taskOf('research'), config).sandbox.filesystem?.allowWrite, [outputs])
    const review = profileFor(taskOf('security_review', { review_of: 't-0', base_commit: 'abc' }), config)
    assert.deepEqual(review.sandbox.filesystem?.allowWrite, [outputs])
  })

  test('code runs in the repo and records the repo as writable', () => {
    const profile = profileFor(taskOf('code'), config)
    assert.equal(profile.cwd, '/work/example-repo')
    assert.equal(profile.sandbox.filesystem?.allowWrite?.[0], '/work/example-repo')
  })

  test('sandbox fails closed when unavailable and never runs commands unsandboxed', () => {
    for (const type of ['research', 'code', 'ops_read'] as TaskType[]) {
      const sandbox = profileFor(taskOf(type), config).sandbox
      assert.equal(sandbox.failIfUnavailable, true)
      assert.equal(sandbox.allowUnsandboxedCommands, false)
    }
  })

  test('sandbox denies reads of the data directory and the credential directories', () => {
    const denyRead = profileFor(taskOf('ops_read'), config).sandbox.filesystem?.denyRead ?? []
    for (const path of [join(home, 'data'), join(homedir(), '.ssh'), join(homedir(), '.gnupg'), join(homedir(), '.netrc'),
      join(homedir(), '.kube'), join(homedir(), '.docker'), join(homedir(), '.config', 'gh')]) {
      assert.ok(denyRead.includes(path), path)
    }
    assert.equal(denyRead.includes(join(homedir(), '.aws')), false, 'aws commands need ~/.aws/config')
  })

  test('autoMode false uses acceptEdits with explicit allow lists for research and code', () => {
    const manual = resolveConfig(home, { autoMode: false })
    const research = profileFor(taskOf('research'), manual)
    const code = profileFor(taskOf('code'), manual)
    assert.equal(research.permissionMode, 'acceptEdits')
    assert.equal(code.permissionMode, 'acceptEdits')
    assert.ok(research.allowedTools && research.allowedTools.length > 0)
    assert.ok(code.allowedTools && code.allowedTools.length > 0)
    assert.equal(code.allowedTools?.includes('Bash'), false)
  })

  test('code without a repo is rejected', () => {
    assert.throws(() => profileFor(taskOf('code', { repo: undefined }), config), /needs a repo/)
  })

  test('user settings only, unless a code task repo is in trustedRepos', () => {
    for (const type of ['research', 'ops_read', 'ops_change', 'security_review'] as TaskType[]) {
      assert.deepEqual(profileFor(taskOf(type, { review_of: 't-0', base_commit: 'abc' }), config).settingSources, ['user'], type)
    }
    assert.deepEqual(profileFor(taskOf('code'), config).settingSources, ['user'])
    const trusted = Object.assign(resolveConfig(home), { trustedRepos: ['/work/example-repo'] })
    assert.deepEqual(profileFor(taskOf('code'), trusted).settingSources, ['user', 'project'])
    const other = Object.assign(resolveConfig(home), { trustedRepos: ['/work/other'] })
    assert.deepEqual(profileFor(taskOf('code'), other).settingSources, ['user'])
    assert.deepEqual(profileFor(taskOf('ops_change'), trusted).settingSources, ['user'])
  })
})
