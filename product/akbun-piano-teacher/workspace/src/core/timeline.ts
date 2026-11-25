// Score -> playable timeline: repeats unrolled, tied notes merged, ticks turned into milliseconds at tempo 1.0.

import type { Hand, Measure, Score, Timeline, TimelineNote } from './model.ts'

// Measure indexes in play order. Handles repeat barlines and first/second endings, each repeat taken once.
// ponytail: D.S./D.C./coda jumps are not followed yet; add them to this function when a target piece needs them.
export function playOrder(measures: Measure[]): number[] {
  const order: number[] = []
  let repeatFrom = 0
  const done = new Set<number>()
  let pass = 1
  let inEnding = false
  for (let i = 0; i < measures.length; i++) {
    const measure = measures[i]
    if (measure.repeatStart || measures[i - 1]?.barline === 'repeat-start') {
      if (repeatFrom !== i) pass = 1
      repeatFrom = i
    }
    // Leaving the endings closes that repeat: a later repeat sign goes back to here, not to the old start.
    if (inEnding && !measure.volta) {
      inEnding = false
      repeatFrom = i
      pass = 1
    }
    if (measure.volta) inEnding = true
    if (measure.volta && measure.volta !== pass) {
      // Skip to the ending for this pass: the next measure whose volta matches, or the first without one.
      let j = i
      while (j < measures.length && measures[j].volta && measures[j].volta !== pass) j++
      i = j - 1
      continue
    }
    order.push(i)
    if (measure.barline === 'repeat-end') {
      if (!done.has(i)) {
        done.add(i)
        pass = 2
        inEnding = false
        i = repeatFrom - 1
      } else if (!measure.volta) {
        // Second time through: the next repeat without its own start sign goes back to the measure after this one.
        repeatFrom = i + 1
        pass = 1
      }
    }
  }
  return order
}

function bpmAt(score: Score, tick: number): number {
  let bpm = score.tempoMap[0]?.bpm ?? 100
  for (const point of score.tempoMap) if (point.tick <= tick) bpm = point.bpm
  return bpm
}

export function buildTimeline(score: Score): Timeline {
  const order = playOrder(score.measures)
  const byMeasure = new Map<number, typeof score.events>()
  for (const event of score.events) byMeasure.set(event.measure, [...(byMeasure.get(event.measure) ?? []), event])

  const notes: TimelineNote[] = []
  const beats: Timeline['beats'] = []
  const measureStarts: Timeline['measureStarts'] = []
  const open = new Map<string, TimelineNote>()
  let ms = 0

  order.forEach((index, playIndex) => {
    const measure = score.measures[index]
    const bpm = bpmAt(score, measure.startTick)
    const toMs = (ticks: number) => (ticks * 60000) / (bpm * score.ticksPerQuarter)
    measureStarts.push({ measure: measure.number, ms, tick: measure.startTick })
    const beatTicks = (score.ticksPerQuarter * 4) / measure.time.beatType
    for (let t = 0; t < measure.lengthTick; t += beatTicks) beats.push({ ms: ms + toMs(t), downbeat: t === 0 })

    for (const event of byMeasure.get(measure.number) ?? []) {
      if (event.kind === 'rest' || event.grace) continue
      const startMs = ms + toMs(event.startTick - measure.startTick)
      const durationMs = toMs(event.durationTick)
      event.pitches.forEach((pitch, i) => {
        const key = `${event.staff}-${pitch.midi}`
        const held = open.get(key)
        let note: TimelineNote
        if (event.tieStop && held && Math.abs(held.startMs + held.durationMs - startMs) < 1) {
          held.durationMs += durationMs
          note = held
        } else {
          note = {
            eventId: event.id,
            playIndex,
            measure: measure.number,
            tick: event.startTick,
            pitch: pitch.midi,
            startMs,
            durationMs,
            hand: event.hand,
            ...(event.finger?.[i] ? { finger: event.finger[i] } : {}),
          }
          notes.push(note)
        }
        if (event.tieStart) open.set(key, note)
        else open.delete(key)
      })
    }
    ms += toMs(measure.lengthTick)
  })

  notes.sort((a, b) => a.startMs - b.startMs || a.pitch - b.pitch)
  return { notes, beats, measureStarts, durationMs: ms }
}

// The part of a timeline a practice run covers: measure range (first pass of each measure in play order) and hands.
export function sliceTimeline(timeline: Timeline, range: { fromMeasure: number; toMeasure: number }, hands: Hand[]) {
  const starts = timeline.measureStarts
  const fromIndex = starts.findIndex((s) => s.measure === range.fromMeasure)
  let toIndex = -1
  for (let i = Math.max(0, fromIndex); i < starts.length; i++) if (starts[i].measure === range.toMeasure) { toIndex = i; break }
  const fromMs = fromIndex >= 0 ? starts[fromIndex].ms : 0
  const toMs = toIndex >= 0 ? (starts[toIndex + 1]?.ms ?? timeline.durationMs) : timeline.durationMs
  return {
    fromMs,
    toMs,
    notes: timeline.notes.filter((n) => n.startMs >= fromMs - 0.5 && n.startMs < toMs - 0.5 && hands.includes(n.hand)),
  }
}
