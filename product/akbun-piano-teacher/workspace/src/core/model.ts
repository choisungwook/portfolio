// Score and session data model. Score keeps the page as written; playback and analysis use TimelineNote[].

export type Hand = 'L' | 'R'
export type Staff = 1 | 2
export type Barline = 'regular' | 'double' | 'final' | 'repeat-start' | 'repeat-end'
export type Jump = 'ds' | 'dc' | 'coda' | 'fine' | 'segno'

export type Pitch = {
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
  alter: -2 | -1 | 0 | 1 | 2
  octave: number
  midi: number
}

export type NoteEvent = {
  id: string
  kind: 'note' | 'rest'
  measure: number
  staff: Staff
  voice: number
  startTick: number
  durationTick: number
  pitches: Pitch[]
  tieStart?: boolean
  tieStop?: boolean
  tuplet?: { actual: number; normal: number }
  grace?: boolean
  finger?: (1 | 2 | 3 | 4 | 5)[]
  hand: Hand
}

export type Measure = {
  number: number
  startTick: number
  lengthTick: number
  isPickup: boolean
  key: number
  time: { beats: number; beatType: number }
  clefs: Record<Staff, 'G' | 'F'>
  octaveShift?: Record<Staff, number>
  barline: Barline
  repeatStart?: boolean
  volta?: number
  jump?: Jump
}

export type Score = {
  id: string
  title: string
  source: 'musicxml' | 'midi' | 'omr'
  ticksPerQuarter: number
  tempoMap: { tick: number; bpm: number }[]
  measures: Measure[]
  events: NoteEvent[]
  pedal?: { tick: number; down: boolean }[]
}

export type TimelineNote = {
  eventId: string
  playIndex: number
  measure: number
  tick: number
  pitch: number
  startMs: number
  durationMs: number
  hand: Hand
  finger?: number
}

export type Timeline = {
  notes: TimelineNote[]
  beats: { ms: number; downbeat: boolean }[]
  measureStarts: { measure: number; ms: number; tick: number }[]
  durationMs: number
}

export type MidiEvent = {
  tMs: number
  kind: 'on' | 'off' | 'pedal'
  pitch?: number
  velocity?: number
  value?: number
}

export type Session = {
  id: string
  scoreId: string
  startedAt: string
  tempoScale: number
  range: { fromMeasure: number; toMeasure: number }
  hands: Hand[]
  events: MidiEvent[]
  videoPath?: string
  videoStartedAtMs?: number
  videoOffsetMs: number
}

export type MistakeKind = 'wrong' | 'missed' | 'extra' | 'hesitation' | 'rush' | 'drag'

export type Mistake = {
  measure: number
  beat: number
  kind: MistakeKind
  expected: number[]
  played: number[]
  clip: { fromMs: number; toMs: number }
}

export type Report = {
  sessionId: string
  accuracy: number
  completedWithoutStop: boolean
  hesitations: number
  tempoCurve: { measure: number; bpm: number }[]
  mistakes: Mistake[]
  weakMeasures: number[]
  suggestedLoops: { fromMeasure: number; toMeasure: number; tempoScale: number }[]
}

export type AnalysisConfig = {
  chordWindowMs: number
  hesitationRatio: number
  hesitationMinMs: number
  tempoDeviation: number
  localTempoWindow: number
}

export const DEFAULT_ANALYSIS: AnalysisConfig = {
  chordWindowMs: 50,
  hesitationRatio: 2.0,
  hesitationMinMs: 600,
  tempoDeviation: 0.15,
  localTempoWindow: 8,
}

export const TPQ = 480

export function handOf(staff: Staff): Hand {
  return staff === 1 ? 'R' : 'L'
}
