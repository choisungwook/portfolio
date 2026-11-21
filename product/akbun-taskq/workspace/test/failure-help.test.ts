import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error plain JS module from the static UI
import { failureHelp } from '../ui/js/pure/failure-help.js'

const failed = (summary: string, alerts: { kind: string; message: string }[] = []) => ({ status: 'failed', runs: [{ summary }], alerts })

test('a failed task gets a cause and steps for the failure it reports, and general steps otherwise', () => {
  assert.match(failureHelp(failed('worker returned no valid structured result'), 'ko').cause, /정해진 형식/)
  assert.match(failureHelp(failed('x', [{ kind: 'auth_required', message: 'login expired' }])).cause, /Signing in/)
  assert.match(failureHelp(failed('tried to run a command outside the sandbox')).cause, /taskq itself/)
  assert.match(failureHelp(failed('something odd')).cause, /little to say/)
  assert.equal(failureHelp({ status: 'done', runs: [] }), null)
})
