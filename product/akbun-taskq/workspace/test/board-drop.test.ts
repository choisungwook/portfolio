import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error plain JS module from the static UI
import { dropRequest } from '../ui/js/pure/board-drop.js'

const task = (status: string, owner: string | null = 'coder') => ({ id: 't1', status, owner })

test('a drop maps to an existing API move, and anything else is refused', () => {
  assert.deepEqual(dropRequest(task('draft'), 'ready'), { method: 'patch', path: '/tasks/t1', body: { status: 'ready' } })
  assert.equal(dropRequest(task('needs_auth'), 'ready').path, '/tasks/t1/resume')
  assert.equal(dropRequest(task('review'), 'done').path, '/tasks/t1/done')
  assert.deepEqual(dropRequest(task('failed'), 'draft').body, { draft: true })
  assert.equal(dropRequest(task('running'), 'cancelled').path, '/tasks/t1/cancel')
  assert.equal(dropRequest(task('draft'), 'running').path, '/tasks/t1/run')
  assert.equal(dropRequest(task('draft', null), 'running'), null, 'a task with no agent does not run')
  assert.equal(dropRequest(task('ready'), 'done'), null, 'done only comes from review')
  assert.equal(dropRequest(task('running'), 'running'), null)
  assert.equal(dropRequest(task('done'), 'needs_approval'), null)
})
