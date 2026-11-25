// OSMD renders the MusicXML; its cursor is moved to the score tick of the playing note.
// OSMD's own audio player is not used; TimelinePlayer owns timing.

import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'

export class ScoreView {
  private osmd: OpenSheetMusicDisplay
  private ticksPerWhole = 1920

  constructor(container: HTMLElement) {
    // No part name: OSMD indents the first line to fit "Piano", so the lines below would start further left.
    // The last line is stretched like the others so every barline grid reads the same width.
    this.osmd = new OpenSheetMusicDisplay(container, {
      autoResize: true,
      followCursor: true,
      drawTitle: true,
      drawPartNames: false,
      drawPartAbbreviations: false,
      stretchLastSystemLine: true,
      backend: 'svg',
    })
  }

  async load(musicxml: string, ticksPerQuarter: number): Promise<void> {
    this.ticksPerWhole = ticksPerQuarter * 4
    await this.osmd.load(musicxml)
    this.osmd.render()
    this.osmd.cursor.show()
    this.osmd.cursor.reset()
  }

  // Lays the score out again for the container's current size, keeping the cursor where it was.
  refresh(): void {
    this.osmd.render()
    this.osmd.cursor.show()
  }

  // Moves the cursor to the last voice entry at or before tick (ticks are the score's own, repeats not unrolled).
  moveTo(tick: number): void {
    const cursor = this.osmd.cursor
    if (!cursor?.Iterator) return
    const target = tick / this.ticksPerWhole + 1e-6
    if (cursor.Iterator.currentTimeStamp.RealValue > target) cursor.reset()
    for (let guard = 0; guard < 10000 && !cursor.Iterator.EndReached; guard++) {
      const clone = cursor.Iterator.clone()
      clone.moveToNext()
      if (clone.EndReached || clone.currentTimeStamp.RealValue > target) break
      cursor.next()
    }
  }
}
