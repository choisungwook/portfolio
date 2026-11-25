import assert from 'node:assert/strict'
import test from 'node:test'
import { TPQ } from '../src/core/model.ts'
import { INITIAL_STATE, measureToNotation, parseNotationSystem } from '../src/core/notation.ts'

const system = (measures: unknown[]) => ({ measureCount: measures.length, measures })

test('reads notes, chords, rests, dots and both staves', () => {
  const parsed = parseNotationSystem(system([
    { number: 1, staves: { 1: { 1: 'E5/q D5/8. C5/16 [E4+G4]/h' }, 2: { 1: 'C3/h r/h' } } },
  ]))
  assert.deepEqual(parsed.issues, [])
  const right = parsed.events.filter((e) => e.staff === 1)
  assert.deepEqual(right.map((e) => e.durationTick), [TPQ, TPQ * 0.75, TPQ * 0.25, TPQ * 2])
  assert.deepEqual(right[3].pitches.map((p) => p.midi), [64, 67])
  assert.equal(parsed.events.find((e) => e.kind === 'rest')?.hand, 'L')
})

test('applies the key signature and keeps a printed accidental to the end of the measure', () => {
  const parsed = parseNotationSystem(system([
    { number: 1, attributes: ['key:2'], staves: { 1: { 1: 'F4/q Fn4/q F4/q C5/q' } } },
    { number: 2, staves: { 1: { 1: 'F4/w' } } },
  ]))
  assert.deepEqual(parsed.events.map((e) => e.pitches[0].midi), [66, 65, 65, 73, 66])
})

test('tuplets, grace notes, fingering and ties', () => {
  const parsed = parseNotationSystem(system([
    { number: 1, staves: { 1: { 1: '{3:2 C5/8 D5/8 E5/8} g:D5/16 C5@1/q C5/h~' } } },
    { number: 2, staves: { 1: { 1: 'C5/w' } } },
  ]))
  assert.deepEqual(parsed.issues, [])
  assert.equal(parsed.events[0].durationTick, TPQ / 3)
  assert.equal(parsed.events[3].grace, true)
  assert.deepEqual(parsed.events[4].finger, [1])
  assert.equal(parsed.events[5].tieStart, true)
  assert.equal(parsed.events[6].tieStop, true)
})

test('flags a voice whose beats do not add up, but accepts a pickup measure', () => {
  const bad = parseNotationSystem(system([
    { number: 1, staves: { 1: { 1: 'C5/q' } } },
    { number: 2, staves: { 1: { 1: 'C5/h C5/q' } } },
  ]))
  assert.equal(bad.measures[0].isPickup, true)
  assert.deepEqual(bad.issues.map((i) => [i.measure, i.kind]), [[2, 'duration']])
})

test('flags unreadable tokens and a wrong measure count', () => {
  const parsed = parseNotationSystem({ measureCount: 2, measures: [{ number: 1, staves: { 1: { 1: 'H4/q C5/h.' } } }] })
  assert.ok(parsed.issues.some((i) => i.message.includes('H4/q')))
  assert.ok(parsed.issues.some((i) => i.message.includes('measureCount')))
})

test('carries time and key into the next system', () => {
  const first = parseNotationSystem(system([{ number: 1, attributes: ['time:3/4', 'key:-1'], staves: { 1: { 1: 'B4/h.' } } }]))
  assert.equal(first.events[0].pitches[0].midi, 70)
  const second = parseNotationSystem(system([{ number: 2, staves: { 1: { 1: 'B4/h.' } } }]), first.state)
  assert.deepEqual(second.issues, [])
  assert.equal(second.measures[0].startTick, TPQ * 3)
  assert.equal(INITIAL_STATE.key, 0, 'the shared initial state must not be mutated')
})

test('measureToNotation writes text that parses back to the same events', () => {
  const source = { number: 1, staves: { 1: { 1: '{3:2 C5/8 D5/8 E5/8} F#5@2/q [C5+E5]/h~' }, 2: { 1: 'C3/w' } } }
  const first = parseNotationSystem(system([source]))
  const again = parseNotationSystem(system([{ number: 1, staves: measureToNotation(first.events) }]))
  const shape = (events: typeof first.events) => events.map((e) => [e.staff, e.startTick, e.durationTick, e.pitches.map((p) => p.midi), e.finger])
  assert.deepEqual(shape(again.events), shape(first.events))
})
