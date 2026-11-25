// LLM OMR: one vision call per page image -> piano-notation v1 -> parser -> checks -> Score.
// Pages whose measures fail the checks are asked again with the problems listed (at most MAX_RETRIES times).
// ponytail: whole pages are sent; staff-system cropping and barline detection (architecture 4.2) come after the P0 measurement.

import { TPQ, type Measure, type NoteEvent, type Score } from './model.ts'
import { INITIAL_STATE, measureToNotation, parseNotationSystem, type NotationState, type ParsedSystem } from './notation.ts'
import type { MeasureOrigin, OmrResult, TaskContext, VisionLlm, VisionUsage } from './ports.ts'

export const PROMPT_VERSION = 'piano-notation-v1.1'
const MAX_RETRIES = 2

export const OMR_SYSTEM = `You transcribe printed piano sheet music into piano-notation v1 JSON. Output one JSON object and nothing else.

Shape: {"measureCount": N, "measures": [{"number": 12, "attributes": [], "staves": {"1": {"1": "E5/q D5/8 C5/8 D5/h"}, "2": {"1": "C3/q G3/q [E4+G4]/h"}}, "barline": "regular", "uncertain": false}]}

Staff "1" is the upper (right hand) staff, "2" the lower. Each staff holds voices "1", "2", ... with space-separated events.
- Note: letter, accidental exactly as printed (# b ## bb n), octave (C4 = middle C): C4, F#4, Bb3, En4. Do not apply the key signature yourself.
- Chord: [C4+E4+G4]/q   Rest: r/q   Durations: /w /h /q /8 /16 /32, dots after: /8. /h..
- Tie start: append ~ (C5/h~). Tuplet: {3:2 C5/8 D5/8 E5/8}. Grace note: g:D5/16. Printed fingering: E5@3/q, chord [C4+E4]@1+3/q.
- attributes: "clef:2:F", "key:-1", "time:3/4", "8va:1:start", "8va:1:stop", "volta:1", "repeat-start", "ds", "dc", "coda", "fine", "segno".
- barline: regular, double, final, repeat-end. Every voice of a measure must add up to the time signature.
- Set "uncertain": true for a measure you cannot read with confidence. Never skip a measure.`

export function omrPrompt(state: NotationState, firstMeasure: number, issues?: string[]): string {
  const clefs = `staff 1 ${state.clefs[1]} clef, staff 2 ${state.clefs[2]} clef`
  const lines = [
    `Transcribe every measure on this page, top system to bottom. Number them from ${firstMeasure}.`,
    `Context carried from the previous page: key signature ${state.key} (sharps positive, flats negative), time ${state.time.beats}/${state.time.beatType}, ${clefs}.`,
    'Write attributes only where the page changes them, plus the first measure if the page restates them.',
  ]
  if (issues?.length) lines.push(`Your previous answer had these problems; fix them:\n- ${issues.join('\n- ')}`)
  return lines.join('\n')
}

export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('no JSON object in the answer')
  return JSON.parse(text.slice(start, end + 1))
}

export type OmrCache = { get(key: string): Promise<string | undefined>; set(key: string, text: string): Promise<void> }

function addUsage(total: VisionUsage, usage?: VisionUsage): void {
  if (!usage) return
  total.inputTokens = (total.inputTokens ?? 0) + (usage.inputTokens ?? 0)
  total.outputTokens = (total.outputTokens ?? 0) + (usage.outputTokens ?? 0)
  total.costUsd = (total.costUsd ?? 0) + (usage.costUsd ?? 0)
}

export async function recognizePages(
  pages: { path: string; hash: string }[],
  llm: VisionLlm,
  cache: OmrCache,
  ctx: TaskContext,
  title: string,
): Promise<OmrResult> {
  let state = INITIAL_STATE
  const measures: Measure[] = []
  const events: NoteEvent[] = []
  const origins: MeasureOrigin[] = []
  const usage: VisionUsage = {}

  for (const [pageIndex, page] of pages.entries()) {
    ctx.signal.throwIfAborted()
    const firstMeasure = measures.length + 1
    let parsed: ParsedSystem | undefined
    let attempts = 0
    let issues: string[] | undefined
    while (attempts <= MAX_RETRIES) {
      attempts += 1
      ctx.progress({ stage: 'recognize', ratio: pageIndex / pages.length, message: `page ${pageIndex + 1}/${pages.length}, try ${attempts}` })
      const cacheKey = [page.hash, llm.id, llm.modelId, PROMPT_VERSION, attempts].join(':')
      let text = await cache.get(cacheKey)
      if (text === undefined) {
        const result = await llm.complete({ system: OMR_SYSTEM, prompt: omrPrompt(state, firstMeasure, issues), images: [page.path] }, ctx)
        addUsage(usage, result.usage)
        text = result.text
        await cache.set(cacheKey, text)
      }
      try {
        parsed = parseNotationSystem(extractJson(text), { ...state, nextTick: measures.reduce((s, m) => s + m.lengthTick, 0) })
        issues = parsed.issues.filter((i) => i.kind !== 'range').map((i) => (i.measure ? `measure ${i.measure}: ${i.message}` : i.message))
      } catch (error) {
        parsed = undefined
        issues = [error instanceof Error ? error.message : String(error)]
      }
      if (parsed && issues.length === 0) break
      ctx.log('warn', `page ${pageIndex + 1}: ${issues.join('; ')}`)
    }
    if (!parsed) throw new Error(`page ${pageIndex + 1} could not be read: ${issues?.join('; ')}`)

    for (const measure of parsed.measures) {
      const own = parsed.issues.filter((i) => i.measure === measure.number).map((i) => i.message)
      origins.push({
        measureNumber: measure.number,
        page: pageIndex + 1,
        status: own.some((m) => !m.includes('range')) ? 'invalid' : parsed.uncertain.includes(measure.number) ? 'uncertain' : 'ok',
        attempts,
        issues: own,
        notation: measureToNotation(parsed.events.filter((e) => e.measure === measure.number)),
      })
    }
    measures.push(...parsed.measures)
    events.push(...parsed.events)
    state = parsed.state
  }
  ctx.progress({ stage: 'recognize', ratio: 1 })

  const score: Score = {
    id: '',
    title,
    source: 'omr',
    ticksPerQuarter: TPQ,
    tempoMap: [{ tick: 0, bpm: 100 }],
    measures,
    events,
  }
  return { score, origins, usage }
}
