import assert from 'node:assert/strict'
import test from 'node:test'
import { TPQ, type Score } from '../src/core/model.ts'
import { parseNotationSystem } from '../src/core/notation.ts'
import { extractJson, recognizePages } from '../src/core/omr.ts'
import { compareScores } from '../src/core/omr-metrics.ts'
import type { VisionLlm } from '../src/core/ports.ts'
import { readCodexEvents } from '../src/main/vision/codex.ts'

const ctx = { signal: new AbortController().signal, progress: () => {}, log: () => {} }
const memoryCache = () => {
  const map = new Map<string, string>()
  return { get: async (k: string) => map.get(k), set: async (k: string, v: string) => void map.set(k, v) }
}

function fakeLlm(answers: string[]): VisionLlm & { calls: string[] } {
  const calls: string[] = []
  return {
    id: 'fake',
    modelId: 'm',
    calls,
    available: async () => ({ ok: true }),
    complete: async (req) => {
      calls.push(req.prompt)
      return { text: answers[calls.length - 1] ?? answers[answers.length - 1], usage: { inputTokens: 10, outputTokens: 5 } }
    },
  }
}

const page = (measures: unknown[]) => '```json\n' + JSON.stringify({ measureCount: measures.length, measures }) + '\n```'

test('asks again with the problems when a measure fails the checks, and uses the corrected answer', async () => {
  const llm = fakeLlm([
    page([{ number: 1, staves: { 1: { 1: 'C5/w' } } }, { number: 2, staves: { 1: { 1: 'D5/h' } } }]),
    page([{ number: 1, staves: { 1: { 1: 'C5/w' } } }, { number: 2, staves: { 1: { 1: 'D5/w' } } }]),
  ])
  const result = await recognizePages([{ path: '/p1.png', hash: 'h1' }], llm, memoryCache(), ctx, 'Song')
  assert.equal(llm.calls.length, 2)
  assert.match(llm.calls[1], /measure 2: a voice lasts 2 beats/)
  assert.deepEqual(result.origins.map((o) => [o.measureNumber, o.status, o.attempts]), [[1, 'ok', 2], [2, 'ok', 2]])
  assert.equal(result.usage.inputTokens, 20)
})

test('carries key and measure numbers to the next page and serves repeats from the cache', async () => {
  const answers = [
    page([{ number: 1, attributes: ['key:2'], staves: { 1: { 1: 'F4/w' } } }]),
    page([{ number: 2, staves: { 1: { 1: 'F4/w' } }, uncertain: true }]),
  ]
  const cache = memoryCache()
  const llm = fakeLlm(answers)
  const pages = [{ path: '/p1.png', hash: 'a' }, { path: '/p2.png', hash: 'b' }]
  const result = await recognizePages(pages, llm, cache, ctx, 'Song')
  assert.match(llm.calls[1], /key signature 2/)
  assert.match(llm.calls[1], /Number them from 2/)
  assert.deepEqual(result.score.events.map((e) => e.pitches[0].midi), [66, 66])
  assert.equal(result.score.measures[1].startTick, TPQ * 4)
  assert.equal(result.origins[1].status, 'uncertain')
  const again = fakeLlm(answers)
  await recognizePages(pages, again, cache, ctx, 'Song')
  assert.equal(again.calls.length, 0)
})

test('keeps invalid measures after the last retry and marks them', async () => {
  // A short first measure reads as a pickup, so measure 2 is the short one.
  const short = fakeLlm([page([{ number: 1, staves: { 1: { 1: 'C5/w' } } }, { number: 2, staves: { 1: { 1: 'C5/h' } } }])])
  const result = await recognizePages([{ path: '/p.png', hash: 'x' }], short, memoryCache(), ctx, 'Song')
  assert.equal(short.calls.length, 3)
  assert.deepEqual(result.origins.map((o) => o.status), ['ok', 'invalid'])
})

test('extractJson finds the object inside prose or code fences', () => {
  assert.deepEqual(extractJson('Here:\n```json\n{"a":1}\n```'), { a: 1 })
  assert.throws(() => extractJson('no json'))
})

test('compareScores counts exact measures and note F1', () => {
  const make = (voice2: string): Score => {
    const p = parseNotationSystem({ measureCount: 2, measures: [{ number: 1, staves: { 1: { 1: 'C5/w' } } }, { number: 2, staves: { 1: { 1: voice2 } } }] })
    return { id: 's', title: 't', source: 'omr', ticksPerQuarter: TPQ, tempoMap: [], measures: p.measures, events: p.events }
  }
  const metrics = compareScores(make('D5/h E5/h'), make('D5/h F5/h'))
  assert.equal(metrics.exactMeasures, 1)
  assert.equal(metrics.measureExactRate, 0.5)
  assert.equal(metrics.onsetF1, 1)
  assert.ok(Math.abs(metrics.pitchF1 - 2 / 3) < 1e-9)
})

test('readCodexEvents takes the last agent message and sums usage', () => {
  const result = readCodexEvents([
    '{"type":"thread.started","thread_id":"t"}',
    '{"type":"item.completed","item":{"type":"reasoning","text":"thinking"}}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"measures\\":[]}"}}',
    '{"type":"turn.completed","usage":{"input_tokens":1200,"cached_input_tokens":0,"output_tokens":300}}',
  ])
  assert.equal(result.text, '{"measures":[]}')
  assert.equal(result.usage?.inputTokens, 1200)
  assert.throws(() => readCodexEvents(['{"type":"turn.failed","error":{"message":"usage limit"}}']), /usage limit/)
})
