// 88-key keyboard on a canvas. Guide notes are colored by hand with the finger number; the user's keys are outlined.

import type { Hand } from '../core/model.ts'
import { isBlackKey } from '../core/pitch.ts'

// progress: how much of a guide note has sounded (0 to 1); the 3D hands lift the finger near the end.
export type KeyMark = { pitch: number; hand?: Hand; finger?: number; progress?: number; tone: 'guide' | 'played' | 'wrong' | 'missed' }

const LOW = 21
const HIGH = 108

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function drawKeyboard(canvas: HTMLCanvasElement, marks: KeyMark[]): void {
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (canvas.width !== width * ratio) canvas.width = width * ratio
  if (canvas.height !== height * ratio) canvas.height = height * ratio
  const g = canvas.getContext('2d')!
  g.setTransform(ratio, 0, 0, ratio, 0, 0)
  g.clearRect(0, 0, width, height)

  const whites = Array.from({ length: HIGH - LOW + 1 }, (_, i) => LOW + i).filter((p) => !isBlackKey(p))
  const keyWidth = width / whites.length
  const x = new Map<number, number>()
  for (const [i, p] of whites.entries()) x.set(p, i * keyWidth)
  const color = (mark: KeyMark) =>
    mark.tone === 'wrong' ? cssVar('--wrong') : mark.tone === 'missed' ? cssVar('--missed') : mark.tone === 'played' ? cssVar('--played') : mark.hand === 'L' ? cssVar('--left') : cssVar('--right')
  const byPitch = new Map<number, KeyMark[]>()
  for (const mark of marks) byPitch.set(mark.pitch, [...(byPitch.get(mark.pitch) ?? []), mark])

  const paint = (pitch: number, left: number, w: number, h: number, base: string) => {
    const list = byPitch.get(pitch) ?? []
    const fill = list.find((m) => m.tone !== 'played')
    g.fillStyle = fill ? color(fill) : base
    g.fillRect(left, 0, w, h)
    g.strokeStyle = cssVar('--key-border')
    g.strokeRect(left + 0.5, 0.5, w - 1, h - 1)
    if (list.some((m) => m.tone === 'played')) {
      g.lineWidth = 3
      g.strokeStyle = cssVar('--played')
      g.strokeRect(left + 2, 2, w - 4, h - 4)
      g.lineWidth = 1
    }
    const finger = fill?.finger
    if (finger) {
      g.fillStyle = '#ffffff'
      g.font = `bold ${Math.max(10, w * 0.6)}px system-ui`
      g.textAlign = 'center'
      g.fillText(String(finger), left + w / 2, h - 8)
    }
  }

  for (const pitch of whites) paint(pitch, x.get(pitch)!, keyWidth, height, cssVar('--white-key'))
  for (let pitch = LOW; pitch <= HIGH; pitch++) {
    if (!isBlackKey(pitch)) continue
    const left = x.get(pitch - 1)! + keyWidth * 0.68
    paint(pitch, left, keyWidth * 0.64, height * 0.62, cssVar('--black-key'))
  }
}
