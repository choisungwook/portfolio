import assert from 'node:assert/strict'
import test from 'node:test'
import { suggestFingering } from '../src/core/fingering.ts'
import type { Hand, TimelineNote } from '../src/core/model.ts'

const note = (startMs: number, pitch: number, hand: Hand, finger?: number): TimelineNote => ({
  eventId: `${startMs}-${pitch}`, playIndex: 0, measure: 1, tick: 0, pitch, startMs, durationMs: 500, hand, ...(finger ? { finger } : {}),
})

test('left-hand chords get fingers from the little finger up to the thumb', () => {
  const notes = [note(0, 48, 'L'), note(0, 55, 'L'), note(2000, 43, 'L')]
  suggestFingering(notes)
  assert.deepEqual(notes.map((n) => n.finger), [5, 1, 5])
})

test('a right-hand five-note scale in place gets 1 to 5', () => {
  const notes = [60, 62, 64, 65, 67].map((p, i) => note(i * 500, p, 'R'))
  suggestFingering(notes)
  assert.deepEqual(notes.map((n) => n.finger), [1, 2, 3, 4, 5])
})

test('printed fingering is kept and moves the hand for the notes around it', () => {
  const notes = [note(0, 67, 'R', 1), note(500, 69, 'R'), note(1000, 71, 'R')]
  suggestFingering(notes)
  assert.deepEqual(notes.map((n) => n.finger), [1, 2, 3])
})

test('fingers in a chord stay in order and never repeat, even for an octave', () => {
  const notes = [note(0, 60, 'R'), note(0, 64, 'R'), note(0, 72, 'R')]
  suggestFingering(notes)
  const fingers = notes.map((n) => n.finger!)
  assert.equal(new Set(fingers).size, 3)
  assert.deepEqual([...fingers].sort(), fingers)
  assert.equal(fingers[0], 1)
  assert.equal(fingers[2], 5)
})
