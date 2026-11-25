import assert from 'node:assert/strict'
import test from 'node:test'
import { analyze } from '../src/core/analysis.ts'
import { DEFAULT_ANALYSIS, TPQ, type MidiEvent, type Score, type Session } from '../src/core/model.ts'
import { parseNotationSystem } from '../src/core/notation.ts'
import { buildTimeline } from '../src/core/timeline.ts'

// 8 measures of quarter notes at 120 bpm: a C major scale up and down, so every onset is 500 ms apart.
const SCALE = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']
const measures = Array.from({ length: 8 }, (_, i) => ({
  number: i + 1,
  staves: { 1: { 1: [0, 1, 2, 3].map((j) => `${SCALE[(i * 4 + j) % 8]}/q`).join(' ') } },
}))
const parsed = parseNotationSystem({ measureCount: 8, measures })
const score: Score = { id: 's', title: 't', source: 'omr', ticksPerQuarter: TPQ, tempoMap: [{ tick: 0, bpm: 120 }], measures: parsed.measures, events: parsed.events }
const expected = buildTimeline(score).notes

function take(edit: (notes: { t: number; pitch: number }[]) => { t: number; pitch: number }[], start = 3000): Session {
  const notes = edit(expected.map((n) => ({ t: n.startMs + start, pitch: n.pitch })))
  const events: MidiEvent[] = notes.flatMap((n) => [
    { tMs: n.t, kind: 'on' as const, pitch: n.pitch, velocity: 80 },
    { tMs: n.t + 400, kind: 'off' as const, pitch: n.pitch },
  ])
  return { id: 'take', scoreId: 's', startedAt: '', tempoScale: 1, range: { fromMeasure: 1, toMeasure: 8 }, hands: ['R'], events, videoOffsetMs: 0 }
}

test('a clean take is all ok', () => {
  const report = analyze(score, take((n) => n), DEFAULT_ANALYSIS)
  assert.equal(report.accuracy, 1)
  assert.equal(report.completedWithoutStop, true)
  assert.deepEqual(report.mistakes, [])
  assert.ok(report.tempoCurve.every((p) => Math.abs(p.bpm - 120) <= 1))
})

test('finds three wrong notes and one hesitation planted in a take', () => {
  const session = take((notes) =>
    notes.map((n, i) => ({
      pitch: i === 5 || i === 14 || i === 22 ? n.pitch + 1 : n.pitch,
      t: i >= 18 ? n.t + 1500 : n.t, // a 2 s gap before note 18 where 0.5 s was expected
    })),
  )
  const report = analyze(score, session, DEFAULT_ANALYSIS)
  const wrong = report.mistakes.filter((m) => m.kind === 'wrong')
  assert.deepEqual(wrong.map((m) => [m.measure, m.beat]), [[2, 2], [4, 3], [6, 3]])
  assert.equal(report.hesitations, 1)
  const pause = report.mistakes.find((m) => m.kind === 'hesitation')!
  assert.deepEqual([pause.measure, pause.beat], [5, 3])
  assert.equal(report.completedWithoutStop, false)
  assert.equal(report.accuracy, 29 / 32)
  for (const m of [2, 4, 5, 6]) assert.ok(report.weakMeasures.includes(m), `measure ${m} should be weak`)
  assert.equal(report.suggestedLoops.length, 3)
})

test('missed and extra notes', () => {
  const session = take((notes) => [...notes.filter((_, i) => i !== 10), { t: notes[20].t + 250, pitch: 90 }])
  const report = analyze(score, session, DEFAULT_ANALYSIS)
  assert.deepEqual(report.mistakes.filter((m) => m.kind === 'missed').map((m) => m.measure), [3])
  assert.deepEqual(report.mistakes.filter((m) => m.kind === 'extra').map((m) => m.played), [[90]])
})

test('flags dragging when the second half slows down by a third', () => {
  const session = take((notes) => notes.map((n, i) => ({ ...n, t: i < 16 ? n.t : notes[16].t + (n.t - notes[16].t) * 1.35 })))
  const report = analyze(score, session, DEFAULT_ANALYSIS)
  assert.ok(report.mistakes.some((m) => m.kind === 'drag' && m.measure >= 6))
  assert.ok(!report.mistakes.some((m) => m.kind === 'drag' && m.measure <= 3))
})
