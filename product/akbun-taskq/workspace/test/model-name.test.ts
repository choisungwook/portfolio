import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modelName } from '../src/team/model-name.ts'

test('a family-only model name gets the version of the id it resolves to', () => {
  assert.equal(modelName('Opus', 'claude-opus-5-5'), 'Opus 5.5')
  assert.equal(modelName('Haiku', 'claude-haiku-5-5-20260101'), 'Haiku 5.5')
  assert.equal(modelName('Sonnet', 'claude-sonnet-5'), 'Sonnet 5')
  assert.equal(modelName('Opus 5.5', 'claude-opus-5-5'), 'Opus 5.5', 'a name with a version is kept')
  assert.equal(modelName('Default', 'default'), 'Default', 'an id without a version is left alone')
})
