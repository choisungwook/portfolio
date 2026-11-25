import type { Pitch } from './model.ts'

const STEP_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'] as const
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'] as const

export function toMidi(step: Pitch['step'], alter: number, octave: number): number {
  return (octave + 1) * 12 + STEP_SEMITONE[step] + alter
}

export function makePitch(step: Pitch['step'], alter: number, octave: number): Pitch {
  return { step, alter: alter as Pitch['alter'], octave, midi: toMidi(step, alter, octave) }
}

// The alter a key signature gives each step: fifths 2 (D major) -> { F: 1, C: 1 }.
export function keyAlters(fifths: number): Partial<Record<Pitch['step'], number>> {
  const result: Partial<Record<Pitch['step'], number>> = {}
  const order = fifths >= 0 ? SHARP_ORDER : FLAT_ORDER
  for (let i = 0; i < Math.min(Math.abs(fifths), 7); i++) result[order[i]] = fifths >= 0 ? 1 : -1
  return result
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiName(midi: number): string {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12)
}
