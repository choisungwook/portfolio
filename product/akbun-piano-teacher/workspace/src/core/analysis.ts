// Rule-based judging of one take against the score. MIDI decides every verdict; an LLM may explain a Report but never changes it.
// 1. Expected notes and played note-ons become chord groups.  2. Needleman-Wunsch aligns the two sequences.
// 3. Pairs become ok / wrong / missed / extra.  4. Gaps and a sliding linear fit find hesitations, rushing and dragging.

import type { AnalysisConfig, Mistake, Report, Score, Session } from './model.ts'
import { buildTimeline, sliceTimeline } from './timeline.ts'

type Group = { t: number; raw: number; pitches: number[]; measure: number; beat: number }
type Pair = { e?: Group; p?: Group }

const GAP = 1
const TIME_WEIGHT = 0.3

function samePitches(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

function substitutionCost(e: Group, p: Group, scale: number, ioi: number): number {
  const shared = e.pitches.filter((x) => p.pitches.includes(x)).length
  const pitchCost = samePitches(e.pitches, p.pitches) ? 0 : shared > 0 ? 0.5 : 1.5
  return pitchCost + TIME_WEIGHT * Math.min(1, Math.abs(p.t - e.t * scale) / ioi)
}

export function align(expected: Group[], played: Group[]): Pair[] {
  const n = expected.length
  const m = played.length
  const spanE = n > 1 ? expected[n - 1].t - expected[0].t : 1
  const spanP = m > 1 ? played[m - 1].t - played[0].t : spanE
  const scale = spanE > 0 ? spanP / spanE : 1
  const iois = expected.slice(1).map((g, i) => g.t - expected[i].t).sort((a, b) => a - b)
  const ioi = Math.max(150, iois[Math.floor(iois.length / 2)] ?? 500)

  const cost = new Float64Array((n + 1) * (m + 1))
  const at = (i: number, j: number) => i * (m + 1) + j
  for (let i = 1; i <= n; i++) cost[at(i, 0)] = i * GAP
  for (let j = 1; j <= m; j++) cost[at(0, j)] = j * GAP
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cost[at(i, j)] = Math.min(
        cost[at(i - 1, j - 1)] + substitutionCost(expected[i - 1], played[j - 1], scale, ioi),
        cost[at(i - 1, j)] + GAP,
        cost[at(i, j - 1)] + GAP,
      )
    }
  }
  const pairs: Pair[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && cost[at(i, j)] === cost[at(i - 1, j - 1)] + substitutionCost(expected[i - 1], played[j - 1], scale, ioi)) {
      pairs.push({ e: expected[--i], p: played[--j] })
    } else if (i > 0 && cost[at(i, j)] === cost[at(i - 1, j)] + GAP) pairs.push({ e: expected[--i] })
    else pairs.push({ p: played[--j] })
  }
  return pairs.reverse()
}

function slope(points: { x: number; y: number }[]): number {
  const mx = points.reduce((s, p) => s + p.x, 0) / points.length
  const my = points.reduce((s, p) => s + p.y, 0) / points.length
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - mx) * (p.y - my)
    den += (p.x - mx) ** 2
  }
  return den === 0 ? 1 : num / den
}

export function analyze(score: Score, session: Session, config: AnalysisConfig): Report {
  const slice = sliceTimeline(buildTimeline(score), session.range, session.hands)
  const measureOf = new Map(score.measures.map((m) => [m.number, m]))

  const expected: Group[] = []
  for (const note of slice.notes) {
    const t = (note.startMs - slice.fromMs) / session.tempoScale
    const last = expected[expected.length - 1]
    if (last && Math.abs(last.t - t) < 1) {
      last.pitches.push(note.pitch)
      continue
    }
    const measure = measureOf.get(note.measure)!
    const beatTicks = (score.ticksPerQuarter * 4) / measure.time.beatType
    expected.push({ t, raw: t, pitches: [note.pitch], measure: note.measure, beat: 1 + (note.tick - measure.startTick) / beatTicks })
  }
  expected.forEach((g) => g.pitches.sort((a, b) => a - b))

  const ons = session.events.filter((e) => e.kind === 'on' && e.pitch !== undefined).sort((a, b) => a.tMs - b.tMs)
  const played: Group[] = []
  for (const on of ons) {
    const last = played[played.length - 1]
    if (last && on.tMs - last.raw <= config.chordWindowMs) {
      if (!last.pitches.includes(on.pitch!)) last.pitches.push(on.pitch!)
    } else played.push({ t: 0, raw: on.tMs, pitches: [on.pitch!], measure: 0, beat: 0 })
  }
  const origin = played[0]?.raw ?? 0
  played.forEach((g) => {
    g.t = g.raw - origin
    g.pitches.sort((a, b) => a - b)
  })

  const pairs = align(expected, played)
  const mistakes: Mistake[] = []
  let lastRaw = origin
  let lastExpected: Group | undefined = expected[0]
  const clip = (raw: number) => ({ fromMs: Math.max(0, raw - 2000), toMs: raw + 2000 })
  let ok = 0

  for (const { e, p } of pairs) {
    if (p) lastRaw = p.raw
    if (e) lastExpected = e
    const place = e ?? lastExpected ?? { measure: session.range.fromMeasure, beat: 1 }
    if (e && p && samePitches(e.pitches, p.pitches)) ok += 1
    else if (e && p) mistakes.push({ measure: e.measure, beat: e.beat, kind: 'wrong', expected: e.pitches, played: p.pitches, clip: clip(p.raw) })
    else if (e) mistakes.push({ measure: e.measure, beat: e.beat, kind: 'missed', expected: e.pitches, played: [], clip: clip(lastRaw) })
    else if (p) mistakes.push({ measure: place.measure, beat: place.beat, kind: 'extra', expected: [], played: p.pitches, clip: clip(p.raw) })
  }

  const matched = pairs.filter((pair): pair is Required<Pair> => !!pair.e && !!pair.p)
  const hesitationAt = new Set<number>()
  for (let i = 1; i < matched.length; i++) {
    const expectedGap = matched[i].e.t - matched[i - 1].e.t
    const playedGap = matched[i].p.t - matched[i - 1].p.t
    if (playedGap > expectedGap * config.hesitationRatio && playedGap > config.hesitationMinMs) {
      hesitationAt.add(i)
      const e = matched[i].e
      mistakes.push({ measure: e.measure, beat: e.beat, kind: 'hesitation', expected: e.pitches, played: matched[i].p.pitches, clip: clip(matched[i].p.raw) })
    }
  }

  const tempoCurve: Report['tempoCurve'] = []
  const flagged = new Set<string>()
  const window = config.localTempoWindow
  for (let i = window - 1; i < matched.length; i++) {
    const span = matched.slice(i - window + 1, i + 1)
    if ([...hesitationAt].some((h) => h > i - window + 1 && h <= i)) continue
    const ratio = slope(span.map((pair) => ({ x: pair.e.t, y: pair.p.t })))
    const e = matched[i].e
    const bpm = (score.tempoMap.filter((t) => t.tick <= (measureOf.get(e.measure)?.startTick ?? 0)).pop()?.bpm ?? 100) * session.tempoScale
    const point = { measure: e.measure, bpm: Math.round(bpm / ratio) }
    if (tempoCurve[tempoCurve.length - 1]?.measure === e.measure) tempoCurve[tempoCurve.length - 1] = point
    else tempoCurve.push(point)
    const kind = ratio < 1 - config.tempoDeviation ? 'rush' : ratio > 1 + config.tempoDeviation ? 'drag' : null
    if (kind && !flagged.has(`${kind}-${e.measure}`)) {
      flagged.add(`${kind}-${e.measure}`)
      mistakes.push({ measure: e.measure, beat: e.beat, kind, expected: e.pitches, played: matched[i].p.pitches, clip: clip(matched[i].p.raw) })
    }
  }

  mistakes.sort((a, b) => a.measure - b.measure || a.beat - b.beat)
  const counts = new Map<number, number>()
  for (const mistake of mistakes) counts.set(mistake.measure, (counts.get(mistake.measure) ?? 0) + 1)
  const weakMeasures = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([measure]) => measure)
  const first = score.measures[0]?.number ?? 1
  const last = score.measures[score.measures.length - 1]?.number ?? 1

  return {
    sessionId: session.id,
    accuracy: expected.length ? ok / expected.length : 0,
    completedWithoutStop: hesitationAt.size === 0 && played.length > 0,
    hesitations: hesitationAt.size,
    tempoCurve,
    mistakes,
    weakMeasures,
    suggestedLoops: weakMeasures.slice(0, 3).map((m) => ({
      fromMeasure: Math.max(first, m - 1),
      toMeasure: Math.min(last, m + 1),
      tempoScale: Math.max(0.25, Math.round(session.tempoScale * 0.75 * 20) / 20),
    })),
  }
}
