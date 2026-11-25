// Suggests a finger for every timeline note the score leaves unfingered, so the keyboard and the 3D hands can show a
// number on each key. Printed fingering always wins. The hand is modeled as five fingers on neighboring white keys,
// thumb on the low side for the right hand and on the high side for the left; it moves only as far as the next notes
// need, and fingers go to the nearest free slot while staying in order away from the thumb.
// ponytail: positional rule only (no thumb-under, no crossings); swap in a real fingering engine (P7) behind this function.

import type { Hand, TimelineNote } from './model.ts'
import { isBlackKey } from './pitch.ts'

// Position on the keyboard in white-key steps; a black key sits halfway between its neighbors.
export function keyPosition(midi: number): number {
  let whites = 0
  for (let p = 0; p < midi; p++) if (!isBlackKey(p)) whites += 1
  return isBlackKey(midi) ? whites - 0.5 : whites
}

const START = { R: keyPosition(60), L: keyPosition(55) } // right thumb on C4, left thumb on G3

export function suggestFingering(notes: TimelineNote[]): void {
  for (const hand of ['R', 'L'] as Hand[]) {
    const dir = hand === 'R' ? 1 : -1
    let thumb = START[hand]
    const mine = notes.filter((n) => n.hand === hand)
    for (let i = 0; i < mine.length; ) {
      let j = i
      while (j < mine.length && Math.abs(mine[j].startMs - mine[i].startMs) < 1) j++
      // Thumb side first: ascending for the right hand, descending for the left.
      const group = mine.slice(i, j).sort((a, b) => (a.pitch - b.pitch) * dir)
      i = j

      const printed = group.filter((n) => n.finger)
      if (printed.length) {
        thumb = printed.reduce((s, n) => s + keyPosition(n.pitch) - dir * (n.finger! - 1), 0) / printed.length
      } else {
        const near = dir * (keyPosition(group[0].pitch) - thumb) // distance of the thumb-side note from the thumb
        const far = dir * (keyPosition(group[group.length - 1].pitch) - thumb)
        if (far - near > 4) thumb = keyPosition(group[0].pitch) // wider than the hand: stretch from the thumb-side note
        else if (near < 0) thumb += dir * near
        else if (far > 4) thumb += dir * (far - 4)
      }

      const used = new Set(printed.map((n) => n.finger!))
      let previous = 0
      group.forEach((note, k) => {
        if (note.finger) {
          previous = note.finger
          return
        }
        const left = group.length - k - 1 // notes after this one still need higher fingers
        const want = 1 + dir * (keyPosition(note.pitch) - thumb)
        let best = 0
        for (let f = previous + 1; f <= 5 - left; f++) {
          if (!used.has(f) && (!best || Math.abs(f - want) < Math.abs(best - want))) best = f
        }
        if (!best) best = Math.min(5, previous + 1)
        note.finger = best
        used.add(best)
        previous = best
      })
    }
  }
}
