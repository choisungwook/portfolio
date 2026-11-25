import assert from 'node:assert/strict'
import test from 'node:test'
import { TPQ, type Score } from '../src/core/model.ts'
import { parseNotationSystem } from '../src/core/notation.ts'
import { buildTimeline, playOrder, sliceTimeline } from '../src/core/timeline.ts'

function score(measures: unknown[], bpm = 120): Score {
  const parsed = parseNotationSystem({ measureCount: measures.length, measures })
  assert.deepEqual(parsed.issues, [])
  return { id: 's', title: 't', source: 'omr', ticksPerQuarter: TPQ, tempoMap: [{ tick: 0, bpm }], measures: parsed.measures, events: parsed.events }
}

test('unrolls a repeat with first and second endings', () => {
  const s = score([
    { number: 1, attributes: ['repeat-start'], staves: { 1: { 1: 'C4/w' } } },
    { number: 2, attributes: ['volta:1'], staves: { 1: { 1: 'D4/w' } }, barline: 'repeat-end' },
    { number: 3, attributes: ['volta:2'], staves: { 1: { 1: 'E4/w' } } },
    { number: 4, staves: { 1: { 1: 'F4/w' } } },
  ])
  assert.deepEqual(playOrder(s.measures).map((i) => s.measures[i].number), [1, 2, 1, 3, 4])
  assert.deepEqual(buildTimeline(s).notes.map((n) => n.pitch), [60, 62, 60, 64, 65])
})

test('a second repeat without a start sign goes back to the end of the first, not to its start', () => {
  const m = (number: number, pitch: string, barline?: string) => ({ number, staves: { 1: { 1: `${pitch}/w` } }, ...(barline ? { barline } : {}) })
  const s = score([m(1, 'C4'), m(2, 'D4', 'repeat-end'), m(3, 'E4'), m(4, 'F4', 'repeat-end')])
  assert.deepEqual(playOrder(s.measures).map((i) => s.measures[i].number), [1, 2, 1, 2, 3, 4, 3, 4])
})

test('after first and second endings, the next repeat goes back to the measure after the endings', () => {
  const s = score([
    { number: 1, staves: { 1: { 1: 'C4/w' } } },
    { number: 2, attributes: ['volta:1'], staves: { 1: { 1: 'D4/w' } }, barline: 'repeat-end' },
    { number: 3, attributes: ['volta:2'], staves: { 1: { 1: 'E4/w' } } },
    { number: 4, staves: { 1: { 1: 'F4/w' } }, barline: 'repeat-end' },
  ])
  assert.deepEqual(playOrder(s.measures).map((i) => s.measures[i].number), [1, 2, 1, 3, 4, 4])
})

test('turns ticks into milliseconds and merges tied notes', () => {
  const s = score([
    { number: 1, staves: { 1: { 1: 'C5/h E5/h~' }, 2: { 1: 'C3/w' } } },
    { number: 2, staves: { 1: { 1: 'E5/q r/q r/h' }, 2: { 1: 'r/w' } } },
  ])
  const timeline = buildTimeline(s)
  const e5 = timeline.notes.find((n) => n.pitch === 76)!
  assert.equal(e5.startMs, 1000)
  assert.equal(e5.durationMs, 1500)
  assert.equal(timeline.notes.length, 3)
  assert.equal(timeline.durationMs, 4000)
  assert.equal(timeline.beats.length, 8)
  assert.deepEqual(timeline.measureStarts.map((m) => m.ms), [0, 2000])
})

test('sliceTimeline keeps the measure range and the chosen hands', () => {
  const s = score([
    { number: 1, staves: { 1: { 1: 'C5/w' }, 2: { 1: 'C3/w' } } },
    { number: 2, staves: { 1: { 1: 'D5/w' }, 2: { 1: 'D3/w' } } },
    { number: 3, staves: { 1: { 1: 'E5/w' }, 2: { 1: 'E3/w' } } },
  ])
  const slice = sliceTimeline(buildTimeline(s), { fromMeasure: 2, toMeasure: 3 }, ['R'])
  assert.deepEqual(slice.notes.map((n) => n.pitch), [74, 76])
  assert.equal(slice.fromMs, 2000)
  assert.equal(slice.toMs, 6000)
})
