import assert from 'node:assert/strict'
import test from 'node:test'
import { DOMParser } from '@xmldom/xmldom'
import { TPQ, type Score } from '../src/core/model.ts'
import { parseMusicXml, writeMusicXml } from '../src/core/musicxml.ts'
import { parseNotationSystem } from '../src/core/notation.ts'

const parse = (xml: string) => parseMusicXml(new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document, 'song')

const SAMPLE = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <work><work-title>Sample</work-title></work>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><key><fifths>1</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time>
        <staves>2</staves><clef number="1"><sign>G</sign></clef><clef number="2"><sign>F</sign></clef></attributes>
      <direction><sound tempo="90"/></direction>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff>
        <notations><technical><fingering>3</fingering></technical></notations></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><tie type="start"/><voice>1</voice><staff>1</staff></note>
      <note><chord/><pitch><step>F</step><alter>1</alter><octave>5</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><staff>2</staff></note>
      <barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/></barline>
    </measure>
    <measure number="2">
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><tie type="stop"/><voice>1</voice><staff>1</staff></note>
      <note><rest/><duration>4</duration><voice>5</voice><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`

test('reads staves, chords, backup, ties, tempo, fingering and repeats', () => {
  const score = parse(SAMPLE)
  assert.equal(score.title, 'Sample')
  assert.deepEqual(score.tempoMap, [{ tick: 0, bpm: 90 }])
  assert.equal(score.measures.length, 2)
  assert.equal(score.measures[0].lengthTick, TPQ * 2)
  assert.equal(score.measures[0].barline, 'repeat-end')
  assert.equal(score.measures[0].key, 1)
  const [e5, chord, bass] = score.events
  assert.deepEqual(e5.finger, [3])
  assert.deepEqual(chord.pitches.map((p) => p.midi), [72, 78])
  assert.equal(chord.startTick, TPQ)
  assert.equal(chord.tieStart, true)
  assert.equal(bass.startTick, 0)
  assert.equal(bass.hand, 'L')
  assert.equal(score.events[3].tieStop, true)
})

test('writeMusicXml output reads back to the same notes', () => {
  const original = parseNotationSystem({
    measureCount: 2,
    measures: [
      { number: 1, attributes: ['key:-2', 'time:3/4'], staves: { 1: { 1: 'Bb4/q {3:2 C5/8 D5/8 E5/8} [F4+A4]@1+3/q~' }, 2: { 1: 'Bb2/h.' } } },
      { number: 2, staves: { 1: { 1: '[F4+A4]/h r/q' }, 2: { 1: 'F2/h.' } }, barline: 'final' },
    ],
  })
  const score: Score = { id: 's', title: 'Round trip', source: 'omr', ticksPerQuarter: TPQ, tempoMap: [{ tick: 0, bpm: 80 }], measures: original.measures, events: original.events }
  const back = parse(writeMusicXml(score))
  const shape = (s: Score) => s.events.map((e) => [e.measure, e.staff, e.startTick, e.durationTick, e.pitches.map((p) => p.midi), !!e.tieStart, !!e.tieStop])
  assert.deepEqual(shape(back), shape(score))
  assert.equal(back.measures[1].barline, 'final')
  assert.deepEqual(back.tempoMap, [{ tick: 0, bpm: 80 }])
})
