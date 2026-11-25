// Standard MIDI file -> Score. A MIDI file has no measures, voices or spelling, so this guesses them:
// first time signature for every measure, a 16th-note grid, sharps for black keys, and one voice per staff.
// Takes the plain shape of a parsed @tonejs/midi Midi so core does not depend on that package.

import { handOf, TPQ, type Measure, type NoteEvent, type Pitch, type Score, type Staff } from './model.ts'
import { makePitch } from './pitch.ts'

export type MidiFileLike = {
  name?: string
  header: { ppq: number; tempos: { ticks: number; bpm: number }[]; timeSignatures: { ticks: number; timeSignature: number[] }[] }
  tracks: { notes: { midi: number; ticks: number; durationTicks: number }[] }[]
}

const SPELL: [Pitch['step'], number][] = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
]

function pitchOf(midi: number): Pitch {
  const [step, alter] = SPELL[midi % 12]
  return makePitch(step, alter, Math.floor(midi / 12) - 1)
}

export function midiToScore(midi: MidiFileLike, id: string, title: string): Score {
  const grid = TPQ / 4
  const scale = TPQ / midi.header.ppq
  const q = (ticks: number) => Math.round((ticks * scale) / grid) * grid
  const [beats, beatType] = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
  const length = (TPQ * 4 * beats) / beatType

  const tracks = midi.tracks.filter((t) => t.notes.length > 0)
  const notes = tracks.flatMap((track, index) =>
    track.notes.map((n) => ({
      midi: n.midi,
      start: q(n.ticks),
      duration: Math.max(grid, q(n.durationTicks)),
      staff: (tracks.length >= 2 ? (index === 0 ? 1 : 2) : n.midi >= 60 ? 1 : 2) as Staff,
    })),
  )
  const end = Math.max(length, ...notes.map((n) => n.start + n.duration))
  const measureCount = Math.ceil(end / length)
  const measures: Measure[] = Array.from({ length: measureCount }, (_, i) => ({
    number: i + 1,
    startTick: i * length,
    lengthTick: length,
    isPickup: false,
    key: 0,
    time: { beats, beatType },
    clefs: { 1: 'G', 2: 'F' },
    barline: i === measureCount - 1 ? 'final' : 'regular',
  }))

  const events: NoteEvent[] = []
  for (const staff of [1, 2] as Staff[]) {
    const byStart = new Map<number, typeof notes>()
    for (const note of notes.filter((n) => n.staff === staff)) byStart.set(note.start, [...(byStart.get(note.start) ?? []), note])
    const starts = [...byStart.keys()].sort((a, b) => a - b)
    starts.forEach((start, i) => {
      const group = byStart.get(start)!
      const next = starts[i + 1] ?? Infinity
      let remaining = Math.min(Math.min(...group.map((n) => n.duration)), next - start)
      let at = start
      // ponytail: notes are cut at the next onset in the same staff; held notes under moving ones are lost.
      while (remaining > 0) {
        const measureIndex = Math.floor(at / length)
        const piece = Math.min(remaining, (measureIndex + 1) * length - at)
        events.push({
          id: `s${staff}-${events.length}`,
          kind: 'note',
          measure: measureIndex + 1,
          staff,
          voice: 1,
          startTick: at,
          durationTick: piece,
          pitches: [...new Set(group.map((n) => n.midi))].sort((a, b) => a - b).map(pitchOf),
          ...(piece < remaining ? { tieStart: true } : {}),
          ...(at > start ? { tieStop: true } : {}),
          hand: handOf(staff),
        })
        at += piece
        remaining -= piece
      }
    })
  }

  const tempoMap = midi.header.tempos.length
    ? midi.header.tempos.map((t) => ({ tick: q(t.ticks), bpm: Math.round(t.bpm) }))
    : [{ tick: 0, bpm: 120 }]
  return { id, title: midi.name || title, source: 'midi', ticksPerQuarter: TPQ, tempoMap, measures, events }
}
