// MusicXML (partwise) <-> Score. Reads the first part only, which is the piano in a solo score.
// Takes a parsed Document so the same code runs on the browser DOMParser and on @xmldom/xmldom in node.

import { handOf, TPQ, type Barline, type Measure, type NoteEvent, type Pitch, type Score, type Staff } from './model.ts'
import { makePitch } from './pitch.ts'

function children(element: Element, name?: string): Element[] {
  const result: Element[] = []
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1 && (!name || (node as Element).nodeName === name)) result.push(node as Element)
  }
  return result
}

function child(element: Element | undefined, name: string): Element | undefined {
  return element ? children(element, name)[0] : undefined
}

function text(element: Element | undefined, name: string): string | undefined {
  return child(element, name)?.textContent?.trim()
}

function num(element: Element | undefined, name: string, fallback: number): number {
  const value = text(element, name)
  return value === undefined || value === '' ? fallback : Number(value)
}

function barlineStyle(barlines: Element[]): { barline: Barline; repeatStart: boolean; volta?: number } {
  let barline: Barline = 'regular'
  let repeatStart = false
  let volta: number | undefined
  for (const bar of barlines) {
    const repeat = child(bar, 'repeat')?.getAttribute('direction')
    const style = text(bar, 'bar-style')
    const ending = child(bar, 'ending')
    if (ending && ending.getAttribute('type') === 'start') volta = Number(ending.getAttribute('number')?.split(',')[0])
    if (repeat === 'forward') repeatStart = true
    else if (repeat === 'backward') barline = 'repeat-end'
    else if (bar.getAttribute('location') !== 'left') {
      if (style === 'light-light') barline = 'double'
      else if (style === 'light-heavy') barline = 'final'
    }
  }
  return { barline, repeatStart, volta }
}

export function parseMusicXml(doc: Document, id: string): Score {
  const root = doc.documentElement
  const title = text(child(root, 'work'), 'work-title') ?? text(root, 'movement-title') ?? 'Untitled'
  const part = children(root, 'part')[0]
  if (!part) throw new Error('MusicXML has no <part>')

  let divisions = 1
  let key = 0
  let time = { beats: 4, beatType: 4 }
  const clefs: Record<Staff, 'G' | 'F'> = { 1: 'G', 2: 'F' }
  const measures: Measure[] = []
  const events: NoteEvent[] = []
  const tempoMap: Score['tempoMap'] = []
  const pedal: NonNullable<Score['pedal']> = []
  let measureStart = 0
  let index = 0

  for (const xmlMeasure of children(part, 'measure')) {
    index += 1
    const number = Number.parseInt(xmlMeasure.getAttribute('number') ?? '', 10) || index
    let position = 0
    let longest = 0
    let lastStart = 0
    let jump: Measure['jump']
    const toTicks = (value: number) => Math.round((value * TPQ) / divisions)

    for (const element of children(xmlMeasure)) {
      const name = element.nodeName
      if (name === 'attributes') {
        divisions = num(element, 'divisions', divisions)
        const keyElement = child(element, 'key')
        if (keyElement) key = num(keyElement, 'fifths', key)
        const timeElement = child(element, 'time')
        if (timeElement) time = { beats: num(timeElement, 'beats', 4), beatType: num(timeElement, 'beat-type', 4) }
        for (const clef of children(element, 'clef')) {
          const staff = Number(clef.getAttribute('number') ?? '1') as Staff
          const sign = text(clef, 'sign')
          if ((staff === 1 || staff === 2) && (sign === 'G' || sign === 'F')) clefs[staff] = sign
        }
      } else if (name === 'backup') position -= toTicks(num(element, 'duration', 0))
      else if (name === 'forward') position += toTicks(num(element, 'duration', 0))
      else if (name === 'direction' || name === 'sound') {
        const sound = name === 'sound' ? element : child(element, 'sound')
        const tempo = sound?.getAttribute('tempo')
        if (tempo) tempoMap.push({ tick: measureStart + position, bpm: Number(tempo) })
        if (sound?.getAttribute('dacapo') === 'yes') jump = 'dc'
        if (sound?.getAttribute('dalsegno')) jump = 'ds'
        if (sound?.getAttribute('fine')) jump = 'fine'
        for (const type of name === 'direction' ? children(element, 'direction-type') : []) {
          const p = child(type, 'pedal')
          if (p) pedal.push({ tick: measureStart + position, down: p.getAttribute('type') !== 'stop' })
        }
      } else if (name === 'note') {
        const isChord = !!child(element, 'chord')
        const grace = !!child(element, 'grace')
        const duration = grace ? 0 : toTicks(num(element, 'duration', 0))
        const staff = (Number(text(element, 'staff') ?? '1') === 2 ? 2 : 1) as Staff
        const voice = Number(text(element, 'voice') ?? '1')
        const start = isChord ? lastStart : position
        const pitchElement = child(element, 'pitch')
        const pitch: Pitch | undefined = pitchElement
          ? makePitch(text(pitchElement, 'step') as Pitch['step'], num(pitchElement, 'alter', 0), num(pitchElement, 'octave', 4))
          : undefined
        const ties = children(element, 'tie').map((t) => t.getAttribute('type'))
        const modification = child(element, 'time-modification')
        const fingering = child(child(child(element, 'notations'), 'technical'), 'fingering')?.textContent?.trim()

        const previous = events[events.length - 1]
        if (isChord && previous && previous.measure === number && pitch) {
          previous.pitches.push(pitch)
          if (ties.includes('start')) previous.tieStart = true
          if (ties.includes('stop')) previous.tieStop = true
          if (fingering) previous.finger = [...(previous.finger ?? []), Number(fingering) as 1]
        } else {
          events.push({
            id: `m${number}-${events.length}`,
            kind: pitch ? 'note' : 'rest',
            measure: number,
            staff,
            voice,
            startTick: measureStart + start,
            durationTick: duration,
            pitches: pitch ? [pitch] : [],
            ...(ties.includes('start') ? { tieStart: true } : {}),
            ...(ties.includes('stop') ? { tieStop: true } : {}),
            ...(modification ? { tuplet: { actual: num(modification, 'actual-notes', 3), normal: num(modification, 'normal-notes', 2) } } : {}),
            ...(grace ? { grace: true } : {}),
            ...(fingering ? { finger: [Number(fingering) as 1] } : {}),
            hand: handOf(staff),
          })
        }
        if (!isChord) {
          lastStart = position
          position += duration
        }
      }
      longest = Math.max(longest, position)
    }

    const full = (TPQ * 4 * time.beats) / time.beatType
    const implicit = xmlMeasure.getAttribute('implicit') === 'yes'
    const length = implicit && longest > 0 ? longest : full
    measures.push({
      number,
      startTick: measureStart,
      lengthTick: length,
      isPickup: implicit && index === 1,
      key,
      time: { ...time },
      clefs: { ...clefs },
      ...barlineStyle(children(xmlMeasure, 'barline')),
      ...(jump ? { jump } : {}),
    })
    measureStart += length
  }

  if (tempoMap.length === 0 || tempoMap[0].tick > 0) tempoMap.unshift({ tick: 0, bpm: 100 })
  return { id, title, source: 'musicxml', ticksPerQuarter: TPQ, tempoMap, measures, events, ...(pedal.length ? { pedal } : {}) }
}

const TYPES: [number, string][] = [
  [TPQ * 4, 'whole'], [TPQ * 2, 'half'], [TPQ, 'quarter'], [TPQ / 2, 'eighth'], [TPQ / 4, '16th'], [TPQ / 8, '32nd'],
]

function noteType(ticks: number): { type: string; dots: number } {
  for (const [base, type] of TYPES) {
    for (const dots of [0, 1, 2]) if (Math.round(base * (2 - 1 / 2 ** dots)) === ticks) return { type, dots }
  }
  return { type: 'quarter', dots: 0 }
}

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Writes a Score as MusicXML so OSMD can draw scores that came from MIDI or OMR. Divisions equal TPQ.
export function writeMusicXml(score: Score): string {
  const out: string[] = []
  out.push('<?xml version="1.0" encoding="UTF-8"?>')
  out.push('<score-partwise version="4.0">')
  out.push(`<work><work-title>${escape(score.title)}</work-title></work>`)
  out.push('<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>')
  out.push('<part id="P1">')
  let previous: Measure | undefined
  for (const measure of score.measures) {
    out.push(`<measure number="${measure.number}"${measure.isPickup ? ' implicit="yes"' : ''}>`)
    if (measure.repeatStart || measure.volta) {
      out.push('<barline location="left">')
      if (measure.repeatStart) out.push('<repeat direction="forward"/>')
      if (measure.volta) out.push(`<ending number="${measure.volta}" type="start"/>`)
      out.push('</barline>')
    }
    const changed = !previous || previous.key !== measure.key || previous.time.beats !== measure.time.beats ||
      previous.time.beatType !== measure.time.beatType || previous.clefs[1] !== measure.clefs[1] || previous.clefs[2] !== measure.clefs[2]
    if (changed) {
      out.push('<attributes>')
      if (!previous) out.push(`<divisions>${score.ticksPerQuarter}</divisions>`)
      out.push(`<key><fifths>${measure.key}</fifths></key>`)
      out.push(`<time><beats>${measure.time.beats}</beats><beat-type>${measure.time.beatType}</beat-type></time>`)
      if (!previous) out.push('<staves>2</staves>')
      for (const staff of [1, 2] as Staff[]) {
        out.push(`<clef number="${staff}"><sign>${measure.clefs[staff]}</sign><line>${measure.clefs[staff] === 'G' ? 2 : 4}</line></clef>`)
      }
      out.push('</attributes>')
    }
    if (!previous) {
      const bpm = score.tempoMap[0]?.bpm ?? 100
      out.push(`<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`)
    }

    const inMeasure = score.events.filter((e) => e.measure === measure.number)
    const voices = [...new Set(inMeasure.map((e) => `${e.staff}:${e.voice}`))].sort()
    let first = true
    for (const key of voices) {
      const [staff, voice] = key.split(':').map(Number)
      if (!first) out.push(`<backup><duration>${measure.lengthTick}</duration></backup>`)
      first = false
      let cursor = measure.startTick
      for (const event of inMeasure.filter((e) => e.staff === staff && e.voice === voice).sort((a, b) => a.startTick - b.startTick)) {
        if (event.startTick > cursor) out.push(`<forward><duration>${event.startTick - cursor}</duration></forward>`)
        const shown = event.tuplet ? Math.round((event.durationTick * event.tuplet.actual) / event.tuplet.normal) : event.durationTick
        const { type, dots } = event.grace ? { type: 'eighth', dots: 0 } : noteType(shown)
        const pitches = event.kind === 'rest' ? [undefined] : event.pitches
        pitches.forEach((pitch, i) => {
          out.push('<note>')
          if (event.grace) out.push('<grace slash="yes"/>')
          if (i > 0) out.push('<chord/>')
          if (pitch) {
            out.push(`<pitch><step>${pitch.step}</step>${pitch.alter ? `<alter>${pitch.alter}</alter>` : ''}<octave>${pitch.octave}</octave></pitch>`)
          } else out.push('<rest/>')
          if (!event.grace) out.push(`<duration>${event.durationTick}</duration>`)
          if (event.tieStop) out.push('<tie type="stop"/>')
          if (event.tieStart) out.push('<tie type="start"/>')
          out.push(`<voice>${voice}</voice><type>${type}</type>${'<dot/>'.repeat(dots)}`)
          if (event.tuplet) out.push(`<time-modification><actual-notes>${event.tuplet.actual}</actual-notes><normal-notes>${event.tuplet.normal}</normal-notes></time-modification>`)
          out.push(`<staff>${staff}</staff>`)
          const ties = [event.tieStop ? '<tied type="stop"/>' : '', event.tieStart ? '<tied type="start"/>' : ''].join('')
          const finger = event.finger?.[i]
          if (ties || finger) out.push(`<notations>${ties}${finger ? `<technical><fingering>${finger}</fingering></technical>` : ''}</notations>`)
          out.push('</note>')
        })
        cursor = event.startTick + event.durationTick
      }
    }
    const style = { regular: '', double: 'light-light', final: 'light-heavy', 'repeat-end': 'light-heavy', 'repeat-start': '' }[measure.barline]
    if (style || measure.barline === 'repeat-end') {
      out.push(`<barline location="right"><bar-style>${style}</bar-style>${measure.barline === 'repeat-end' ? '<repeat direction="backward"/>' : ''}</barline>`)
    }
    out.push('</measure>')
    previous = measure
  }
  out.push('</part>')
  out.push('</score-partwise>')
  return out.join('\n')
}
