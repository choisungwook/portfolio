// piano-notation v1: the short per-measure text an LLM writes for one system, and that a user edits by hand.
// Example voice: "E5/q D5/8 C5/8 [E4+G4]/h~ {3:2 C5/8 D5/8 E5/8} g:D5/16 r/q E5@3/q".
// Pitches are read as printed (written accidental only); the key signature and in-measure accidentals are applied here.

import { handOf, TPQ, type Barline, type Jump, type Measure, type NoteEvent, type Pitch, type Staff } from './model.ts'
import { keyAlters, makePitch } from './pitch.ts'

export type NotationMeasure = {
  number: number
  attributes?: string[]
  staves: Record<string, Record<string, string>>
  barline?: Barline
  uncertain?: boolean
}

export type NotationSystem = {
  system?: number
  measureCount: number
  measures: NotationMeasure[]
}

export type NotationState = {
  key: number
  time: { beats: number; beatType: number }
  clefs: Record<Staff, 'G' | 'F'>
  octaveShift: Record<Staff, number>
  nextTick: number
  measuresSoFar: number
}

export type MeasureIssue = { measure: number; kind: 'format' | 'duration' | 'range'; message: string }

export type ParsedSystem = {
  measures: Measure[]
  events: NoteEvent[]
  issues: MeasureIssue[]
  uncertain: number[]
  state: NotationState
}

export const INITIAL_STATE: NotationState = {
  key: 0,
  time: { beats: 4, beatType: 4 },
  clefs: { 1: 'G', 2: 'F' },
  octaveShift: { 1: 0, 2: 0 },
  nextTick: 0,
  measuresSoFar: 0,
}

const DURATION: Record<string, number> = { w: TPQ * 4, h: TPQ * 2, q: TPQ, '8': TPQ / 2, '16': TPQ / 4, '32': TPQ / 8 }
const JUMPS = new Set(['ds', 'dc', 'coda', 'fine', 'segno'])
const STAFF_RANGE: Record<Staff, [number, number]> = { 1: [43, 108], 2: [21, 76] }

const TOKEN = /^(g:)?(\[[^\]]+\]|r|[A-G](?:##|#|bb|b|n)?-?\d)(?:@([1-5](?:\+[1-5])*))?\/(w|h|q|8|16|32)(\.{0,2})(~?)$/
const PITCH = /^([A-G])(##|#|bb|b|n)?(-?\d)$/
const ACCIDENTAL: Record<string, number> = { '##': 2, '#': 1, n: 0, b: -1, bb: -2 }

export function measureLength(time: { beats: number; beatType: number }): number {
  return (TPQ * 4 * time.beats) / time.beatType
}

type Token = { text: string; tuplet?: { actual: number; normal: number } }

function splitTokens(voice: string): Token[] {
  const tokens: Token[] = []
  const pattern = /\{(\d+):(\d+)\s+([^}]*)\}|(\S+)/g
  for (const match of voice.matchAll(pattern)) {
    if (match[4]) tokens.push({ text: match[4] })
    else {
      const tuplet = { actual: Number(match[1]), normal: Number(match[2]) }
      for (const text of match[3].trim().split(/\s+/)) tokens.push({ text, tuplet })
    }
  }
  return tokens
}

export function tokenDuration(base: string, dots: number, tuplet?: { actual: number; normal: number }): number {
  let ticks = DURATION[base] * (2 - 1 / 2 ** dots)
  if (tuplet) ticks = (ticks * tuplet.normal) / tuplet.actual
  return Math.round(ticks)
}

function applyAttribute(attribute: string, state: NotationState, measure: Partial<Measure>): string | null {
  const [name, ...args] = attribute.split(':')
  if (name === 'clef' && (args[1] === 'G' || args[1] === 'F')) state.clefs[Number(args[0]) as Staff] = args[1]
  else if (name === 'key') state.key = Number(args[0])
  else if (name === 'time') {
    const [beats, beatType] = args[0].split('/').map(Number)
    state.time = { beats, beatType }
  } else if (name === '8va' || name === '8vb') {
    const staff = Number(args[0]) as Staff
    state.octaveShift[staff] = args[1] === 'stop' ? 0 : name === '8va' ? 1 : -1
  } else if (name === 'volta') measure.volta = Number(args[0])
  else if (name === 'repeat-start') measure.repeatStart = true
  else if (JUMPS.has(name)) measure.jump = name as Jump
  else return `unknown attribute "${attribute}"`
  return null
}

// Parses one measure. Accidentals last to the end of the measure on the same step and octave.
function parseMeasure(input: NotationMeasure, state: NotationState, idPrefix: string) {
  const issues: MeasureIssue[] = []
  const partial: Partial<Measure> = {}
  for (const attribute of input.attributes ?? []) {
    const problem = applyAttribute(attribute, state, partial)
    if (problem) issues.push({ measure: input.number, kind: 'format', message: problem })
  }
  const length = measureLength(state.time)
  const events: NoteEvent[] = []
  const keyAlter = keyAlters(state.key)
  const voiceLengths: number[] = []

  for (const [staffKey, voices] of Object.entries(input.staves ?? {})) {
    const staff = Number(staffKey) as Staff
    if (staff !== 1 && staff !== 2) {
      issues.push({ measure: input.number, kind: 'format', message: `staff ${staffKey} is not 1 or 2` })
      continue
    }
    const carried = new Map<string, number>()
    for (const [voiceKey, text] of Object.entries(voices)) {
      let offset = 0
      for (const token of splitTokens(text)) {
        const match = TOKEN.exec(token.text)
        if (!match) {
          issues.push({ measure: input.number, kind: 'format', message: `cannot read "${token.text}" in staff ${staff} voice ${voiceKey}` })
          continue
        }
        const [, grace, body, finger, base, dots, tie] = match
        const duration = grace ? 0 : tokenDuration(base, dots.length, token.tuplet)
        const pitches: Pitch[] = []
        if (body !== 'r') {
          const names = body.startsWith('[') ? body.slice(1, -1).split('+') : [body]
          for (const name of names) {
            const parts = PITCH.exec(name)
            if (!parts) {
              issues.push({ measure: input.number, kind: 'format', message: `bad pitch "${name}"` })
              continue
            }
            const step = parts[1] as Pitch['step']
            const octave = Number(parts[3]) + state.octaveShift[staff]
            const slot = `${step}${octave}`
            let alter: number
            if (parts[2] !== undefined) {
              alter = ACCIDENTAL[parts[2]]
              carried.set(slot, alter)
            } else alter = carried.get(slot) ?? keyAlter[step] ?? 0
            const pitch = makePitch(step, alter, octave)
            const [low, high] = STAFF_RANGE[staff]
            if (pitch.midi < low || pitch.midi > high) {
              issues.push({ measure: input.number, kind: 'range', message: `${name} is outside the usual range of staff ${staff}` })
            }
            pitches.push(pitch)
          }
        }
        events.push({
          id: `${idPrefix}-${staff}-${voiceKey}-${events.length}`,
          kind: body === 'r' ? 'rest' : 'note',
          measure: input.number,
          staff,
          voice: Number(voiceKey),
          startTick: state.nextTick + offset,
          durationTick: duration,
          pitches,
          ...(tie ? { tieStart: true } : {}),
          ...(token.tuplet ? { tuplet: token.tuplet } : {}),
          ...(grace ? { grace: true } : {}),
          ...(finger ? { finger: finger.split('+').map(Number) as NoteEvent['finger'] } : {}),
          hand: handOf(staff),
        })
        offset += duration
      }
      voiceLengths.push(offset)
    }
  }

  const longest = Math.max(0, ...voiceLengths)
  const isPickup = state.measuresSoFar === 0 && longest > 0 && longest < length && voiceLengths.every((v) => v === longest)
  const expected = isPickup ? longest : length
  voiceLengths.forEach((actual) => {
    if (actual !== expected) {
      issues.push({ measure: input.number, kind: 'duration', message: `a voice lasts ${actual / TPQ} beats, the measure needs ${expected / TPQ}` })
    }
  })

  const measure: Measure = {
    number: input.number,
    startTick: state.nextTick,
    lengthTick: expected,
    isPickup,
    key: state.key,
    time: { ...state.time },
    clefs: { ...state.clefs },
    barline: input.barline ?? 'regular',
    ...partial,
  }
  if (state.octaveShift[1] || state.octaveShift[2]) measure.octaveShift = { ...state.octaveShift }
  state.nextTick += expected
  state.measuresSoFar += 1
  return { measure, events, issues }
}

// Marks tieStop on the next note of the same voice that holds a tied pitch, also across measures.
function linkTies(events: NoteEvent[]): void {
  const byVoice = new Map<string, NoteEvent[]>()
  for (const event of events) {
    const key = `${event.staff}-${event.voice}`
    byVoice.set(key, [...(byVoice.get(key) ?? []), event])
  }
  for (const list of byVoice.values()) {
    list.sort((a, b) => a.startTick - b.startTick)
    for (let i = 0; i < list.length - 1; i++) {
      if (!list[i].tieStart) continue
      const next = list.slice(i + 1).find((e) => !e.grace)
      if (next && next.pitches.some((p) => list[i].pitches.some((q) => q.midi === p.midi))) next.tieStop = true
    }
  }
}

export function parseNotationSystem(input: unknown, previous: NotationState = INITIAL_STATE): ParsedSystem {
  const state: NotationState = structuredClone(previous)
  const system = input as NotationSystem
  if (!system || !Array.isArray(system.measures)) {
    return { measures: [], events: [], issues: [{ measure: 0, kind: 'format', message: 'no measures array' }], uncertain: [], state }
  }
  const measures: Measure[] = []
  const events: NoteEvent[] = []
  const issues: MeasureIssue[] = []
  const uncertain: number[] = []
  for (const item of system.measures) {
    const parsed = parseMeasure(item, state, `m${item.number}`)
    measures.push(parsed.measure)
    events.push(...parsed.events)
    issues.push(...parsed.issues)
    if (item.uncertain) uncertain.push(item.number)
  }
  if (typeof system.measureCount === 'number' && system.measureCount !== system.measures.length) {
    issues.push({ measure: 0, kind: 'format', message: `measureCount ${system.measureCount} but ${system.measures.length} measures` })
  }
  linkTies(events)
  return { measures, events, issues, uncertain, state }
}

function durationText(ticks: number): string {
  for (const [name, base] of Object.entries(DURATION)) {
    for (const dots of [0, 1, 2]) if (Math.round(base * (2 - 1 / 2 ** dots)) === ticks) return `${name}${'.'.repeat(dots)}`
  }
  return 'q'
}

// Writes events of one measure back as notation, with every accidental written out (used by the editor and tests).
export function measureToNotation(events: NoteEvent[]): Record<string, Record<string, string>> {
  const staves: Record<string, Record<string, string>> = {}
  const sorted = [...events].sort((a, b) => a.startTick - b.startTick)
  for (const event of sorted) {
    const name = (p: Pitch) => `${p.step}${['bb', 'b', 'n', '#', '##'][p.alter + 2]}${p.octave}`
    let body = event.kind === 'rest' ? 'r' : event.pitches.length > 1 ? `[${event.pitches.map(name).join('+')}]` : name(event.pitches[0])
    if (event.finger?.length) body += `@${event.finger.join('+')}`
    const ticks = event.tuplet ? (event.durationTick * event.tuplet.actual) / event.tuplet.normal : event.durationTick
    let text = `${event.grace ? 'g:' : ''}${body}/${event.grace ? '16' : durationText(ticks)}${event.tieStart ? '~' : ''}`
    if (event.tuplet) text = `{${event.tuplet.actual}:${event.tuplet.normal} ${text}}`
    staves[event.staff] ??= {}
    const voice = String(event.voice)
    staves[event.staff][voice] = staves[event.staff][voice] ? `${staves[event.staff][voice]} ${text}` : text
  }
  return staves
}
