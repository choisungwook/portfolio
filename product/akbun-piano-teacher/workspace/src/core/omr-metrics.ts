// Scores an OMR result against a hand-checked answer (architecture 4.8): measure exact match, pitch F1, onset F1.
// Measures are compared by position (1st with 1st), and notes by tick inside their measure, so a missing measure
// costs that measure, not every measure after it.

import type { Score } from './model.ts'

export type OmrMetrics = { measures: number; exactMeasures: number; measureExactRate: number; pitchF1: number; onsetF1: number }

function notesByMeasure(score: Score): string[][] {
  return score.measures.map((measure) =>
    score.events
      .filter((e) => e.measure === measure.number && e.kind === 'note' && !e.grace)
      .flatMap((e) => e.pitches.map((p) => `${e.startTick - measure.startTick}:${e.durationTick}:${p.midi}`))
      .sort(),
  )
}

function f1(found: string[], truth: string[]): number {
  if (found.length === 0 && truth.length === 0) return 1
  const pool = new Map<string, number>()
  for (const key of truth) pool.set(key, (pool.get(key) ?? 0) + 1)
  let hit = 0
  for (const key of found) {
    const left = pool.get(key) ?? 0
    if (left > 0) {
      hit += 1
      pool.set(key, left - 1)
    }
  }
  const precision = found.length ? hit / found.length : 0
  const recall = truth.length ? hit / truth.length : 0
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
}

export function compareScores(result: Score, truth: Score): OmrMetrics {
  const got = notesByMeasure(result)
  const want = notesByMeasure(truth)
  let exact = 0
  const pitches: [string[], string[]] = [[], []]
  const onsets: [string[], string[]] = [[], []]
  want.forEach((notes, i) => {
    const mine = got[i] ?? []
    if (mine.join('|') === notes.join('|')) exact += 1
    pitches[0].push(...mine.map((n) => `${i}:${n.split(':')[0]}:${n.split(':')[2]}`))
    pitches[1].push(...notes.map((n) => `${i}:${n.split(':')[0]}:${n.split(':')[2]}`))
    onsets[0].push(...new Set(mine.map((n) => `${i}:${n.split(':')[0]}`)))
    onsets[1].push(...new Set(notes.map((n) => `${i}:${n.split(':')[0]}`)))
  })
  return {
    measures: want.length,
    exactMeasures: exact,
    measureExactRate: want.length ? exact / want.length : 0,
    pitchF1: f1(...pitches),
    onsetF1: f1(...onsets),
  }
}
