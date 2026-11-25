// TimelinePlayer: plays a Timeline through a Tone.js sampler with a look-ahead scheduler driven by requestAnimationFrame.
// Position is derived from the audio clock, so the cursor and keyboard follow the sound, not the frame rate.

import * as Tone from 'tone'
import type { Hand, Timeline, TimelineNote } from '../core/model.ts'
import type { Player, PlayerPosition } from '../core/ports.ts'

const SALAMANDER = 'https://tonejs.github.io/audio/salamander/'
const LOOKAHEAD_MS = 250

function salamanderUrls(): Record<string, string> {
  const urls: Record<string, string> = { A0: 'A0.mp3', C8: 'C8.mp3' }
  for (let octave = 1; octave <= 7; octave++) {
    for (const [note, file] of [['C', 'C'], ['D#', 'Ds'], ['F#', 'Fs'], ['A', 'A']]) urls[`${note}${octave}`] = `${file}${octave}.mp3`
  }
  return urls
}

let sampler: Tone.Sampler | null = null
let fallback: Tone.PolySynth | null = null
let click: Tone.MembraneSynth | null = null

// Salamander samples load from the network the first time; until then (or offline) a plain synth plays.
export async function loadSynth(): Promise<void> {
  await Tone.start()
  click ??= new Tone.MembraneSynth({ octaves: 2, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 } }).toDestination()
  click.volume.value = -10
  fallback ??= new Tone.PolySynth(Tone.Synth).toDestination()
  fallback.volume.value = -12
  if (!sampler) {
    sampler = new Tone.Sampler({ urls: salamanderUrls(), baseUrl: SALAMANDER, release: 1 }).toDestination()
    await Tone.loaded().catch(() => undefined)
  }
}

function instrument(): Tone.Sampler | Tone.PolySynth | null {
  return sampler?.loaded ? sampler : fallback
}

export function playNote(pitch: number, durationSec: number, atSec: number, velocity = 0.7): void {
  instrument()?.triggerAttackRelease(Tone.Frequency(pitch, 'midi').toFrequency(), durationSec, atSec, velocity)
}

export class TimelinePlayer implements Player {
  private timeline: Timeline
  private scale = 1
  private hands: Hand[] = ['R', 'L']
  private loop: { fromMs: number; toMs: number } | null = null
  private metronome = false
  private muted = false
  private listeners = new Set<(p: PlayerPosition) => void>()
  private originSec = 0
  private originMs = 0
  private positionMs = 0
  private scheduledMs = 0
  private nextBeat = 0
  private frame = 0
  playing = false

  constructor(timeline: Timeline) {
    this.timeline = timeline
  }

  setMuted(muted: boolean): void {
    this.muted = muted
  }

  play(): void {
    if (this.playing) return
    if (this.loop && (this.positionMs < this.loop.fromMs || this.positionMs >= this.loop.toMs)) this.positionMs = this.loop.fromMs
    if (this.positionMs >= this.timeline.durationMs) this.positionMs = 0
    this.playing = true
    this.restartAt(this.positionMs)
    const tick = () => {
      if (!this.playing) return
      this.step()
      this.frame = requestAnimationFrame(tick)
    }
    tick()
  }

  pause(): void {
    this.playing = false
    cancelAnimationFrame(this.frame)
    instrument()?.releaseAll()
    this.emit()
  }

  seekMeasure(measure: number): void {
    const start = this.timeline.measureStarts.find((m) => m.measure === measure)
    if (!start) return
    this.positionMs = start.ms
    if (this.playing) this.restartAt(start.ms)
    this.emit()
  }

  setTempoScale(scale: number): void {
    this.scale = scale
    if (this.playing) this.restartAt(this.positionMs)
  }

  setLoop(range: { fromMeasure: number; toMeasure: number } | null): void {
    if (!range) {
      this.loop = null
      return
    }
    const starts = this.timeline.measureStarts
    const from = starts.find((m) => m.measure === range.fromMeasure)
    const toIndex = starts.findIndex((m, i) => m.measure === range.toMeasure && (!from || m.ms >= from.ms) && i >= 0)
    if (!from || toIndex < 0) {
      this.loop = null
      return
    }
    this.loop = { fromMs: from.ms, toMs: starts[toIndex + 1]?.ms ?? this.timeline.durationMs }
  }

  setHands(hands: Hand[]): void {
    this.hands = hands
  }

  setMetronome(on: boolean): void {
    this.metronome = on
  }

  onPosition(listener: (p: PlayerPosition) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get position(): number {
    return this.positionMs
  }

  get loopRange() {
    return this.loop
  }

  activeNotes(): TimelineNote[] {
    const ms = this.positionMs
    return this.timeline.notes.filter((n) => n.startMs <= ms && ms < n.startMs + n.durationMs && this.hands.includes(n.hand))
  }

  private restartAt(ms: number): void {
    instrument()?.releaseAll()
    this.originSec = Tone.now() + 0.05
    this.originMs = ms
    this.positionMs = ms
    this.scheduledMs = ms
    this.nextBeat = this.timeline.beats.findIndex((b) => b.ms >= ms - 0.5)
  }

  private toSec(ms: number): number {
    return this.originSec + (ms - this.originMs) / 1000 / this.scale
  }

  private step(): void {
    this.positionMs = this.originMs + (Tone.now() - this.originSec) * 1000 * this.scale
    const end = this.loop?.toMs ?? this.timeline.durationMs
    if (this.positionMs >= end) {
      if (this.loop) this.restartAt(this.loop.fromMs)
      else {
        this.positionMs = 0
        this.pause()
        return
      }
    }
    const horizon = Math.min(end, this.positionMs + LOOKAHEAD_MS * this.scale)
    if (!this.muted) {
      for (const note of this.timeline.notes) {
        if (note.startMs >= this.scheduledMs && note.startMs < horizon && this.hands.includes(note.hand)) {
          playNote(note.pitch, Math.max(0.05, note.durationMs / 1000 / this.scale), Math.max(Tone.now(), this.toSec(note.startMs)))
        }
      }
    }
    while (this.metronome && this.nextBeat >= 0 && this.nextBeat < this.timeline.beats.length && this.timeline.beats[this.nextBeat].ms < horizon) {
      const beat = this.timeline.beats[this.nextBeat++]
      click?.triggerAttackRelease(beat.downbeat ? 'C5' : 'G4', 0.05, Math.max(Tone.now(), this.toSec(beat.ms)))
    }
    if (!this.metronome && this.nextBeat >= 0) this.nextBeat = this.timeline.beats.findIndex((b) => b.ms >= horizon)
    this.scheduledMs = horizon
    this.emit()
  }

  private emit(): void {
    const ms = this.positionMs
    let measure = this.timeline.measureStarts[0]?.measure ?? 1
    for (const start of this.timeline.measureStarts) if (start.ms <= ms) measure = start.measure
    const position: PlayerPosition = { timelineMs: ms, measure, activeNoteIds: this.activeNotes().map((n) => n.eventId) }
    for (const listener of this.listeners) listener(position)
  }
}
