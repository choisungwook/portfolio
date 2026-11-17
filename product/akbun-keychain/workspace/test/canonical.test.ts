import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { canonical } from '../src/core/canonical.ts'

test('canonical sorts keys at every depth and drops whitespace', () => {
  assert.equal(canonical({ b: 1, a: { d: [2, 'x'], c: true } }), '{"a":{"c":true,"d":[2,"x"]},"b":1}')
})

test('canonical is the same for objects built in a different order', () => {
  assert.equal(canonical({ x: 1, y: 2 }), canonical({ y: 2, x: 1 }))
})

test('canonical refuses values JSON cannot represent', () => {
  assert.throws(() => canonical(Number.NaN))
  assert.throws(() => canonical([undefined]))
})
