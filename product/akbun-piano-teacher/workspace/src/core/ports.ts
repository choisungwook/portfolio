// Contracts between features and their implementations. Only features with two or more implementations
// (VisionLlm) get a registry and a setting; the rest are here so adapters can be swapped without touching callers.

import type { Hand, Score } from './model.ts'

export type TaskProgress = { stage: string; ratio?: number; message?: string }

export type TaskContext = {
  signal: AbortSignal
  progress(p: TaskProgress): void
  log(level: 'info' | 'warn' | 'error', message: string): void
}

export type Availability =
  | { ok: true }
  | { ok: false; reason: 'not-installed' | 'not-logged-in' | 'no-api-key' | 'unsupported-os'; hint: string }

export type VisionUsage = { inputTokens?: number; outputTokens?: number; costUsd?: number }

export type VisionRequest = {
  system: string
  prompt: string
  images: string[] // absolute file paths
}

export type VisionResult = { text: string; json?: unknown; usage?: VisionUsage }

export interface VisionLlm {
  id: string
  modelId: string
  available(): Promise<Availability>
  complete(req: VisionRequest, ctx: TaskContext): Promise<VisionResult>
}

export type MeasureStatus = 'ok' | 'disagree' | 'invalid' | 'uncertain' | 'user-edited'

export type MeasureOrigin = {
  measureNumber: number
  page: number
  status: MeasureStatus
  attempts: number
  issues: string[]
  notation: Record<string, Record<string, string>>
}

export type OmrResult = { score: Score; origins: MeasureOrigin[]; usage: VisionUsage }

export type PlayerPosition = { timelineMs: number; measure: number; activeNoteIds: string[] }

export interface Player {
  play(): void
  pause(): void
  seekMeasure(measure: number): void
  setTempoScale(scale: number): void
  setLoop(range: { fromMeasure: number; toMeasure: number } | null): void
  setHands(hands: Hand[]): void
  setMetronome(on: boolean): void
  onPosition(listener: (p: PlayerPosition) => void): () => void
}
