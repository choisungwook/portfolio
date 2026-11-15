import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ftsMatch, searchHistory } from '../src/db/search.ts'
import { setup } from './helpers.ts'

test('ftsMatch strips control characters, NUL included, from each term', () => {
  assert.equal(ftsMatch('foo\u0000bar'), '"foobar"')
  assert.equal(ftsMatch('a\u0001 \u007f b'), '"a" "b"')
})

test('a search with a NUL in the query runs without error', () => {
  const env = setup()
  try {
    assert.doesNotThrow(() => searchHistory(env.db, 'summary\u0000'))
  } finally {
    env.cleanup()
  }
})
