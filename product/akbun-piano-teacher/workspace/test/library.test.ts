import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import test from 'node:test'
import ToneMidi from '@tonejs/midi'
import JSZip from 'jszip'
import { TPQ } from '../src/core/model.ts'
import { parseNotationSystem } from '../src/core/notation.ts'
import { writeMusicXml } from '../src/core/musicxml.ts'
import * as library from '../src/main/library.ts'

const parsed = parseNotationSystem({ measureCount: 2, measures: [{ number: 1, staves: { 1: { 1: 'C5/h E5/h' }, 2: { 1: 'C3/w' } } }, { number: 2, staves: { 1: { 1: 'G5/w' }, 2: { 1: 'G2/w' } } }] })
const xml = writeMusicXml({ id: '', title: 'Little Piece', source: 'omr', ticksPerQuarter: TPQ, tempoMap: [{ tick: 0, bpm: 100 }], measures: parsed.measures, events: parsed.events })

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'piano-teacher-lib-'))
}

test('imports .musicxml and .mxl, lists them, and loads the same notes', async () => {
  const root = await tempRoot()
  try {
    const plain = path.join(root, 'piece.musicxml')
    await fs.writeFile(plain, xml)
    const zip = new JSZip()
    zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>')
    zip.file('score.xml', xml)
    const packed = path.join(root, 'packed.mxl')
    await fs.writeFile(packed, await zip.generateAsync({ type: 'nodebuffer' }))

    const a = await library.importScoreFile(root, plain)
    const b = await library.importScoreFile(root, packed)
    const songs = await library.listSongs(root)
    assert.equal(songs.length, 2)
    assert.ok(songs.every((s) => s.title === 'Little Piece' && s.measures === 2))
    const [first, second] = await Promise.all([library.loadSong(root, a), library.loadSong(root, b)])
    assert.deepEqual(first.score.events.map((e) => e.pitches[0].midi), [72, 76, 48, 79, 43])
    assert.deepEqual(second.score.events.length, first.score.events.length)
    assert.ok(first.musicxml.includes('<score-partwise'))
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('imports a MIDI file into measures with the right hands', async () => {
  const root = await tempRoot()
  try {
    const midi = new ToneMidi.Midi()
    midi.header.setTempo(90)
    const right = midi.addTrack()
    const left = midi.addTrack()
    right.addNote({ midi: 72, ticks: 0, durationTicks: midi.header.ppq * 2 })
    right.addNote({ midi: 74, ticks: midi.header.ppq * 2, durationTicks: midi.header.ppq * 4 }) // crosses the barline
    left.addNote({ midi: 48, ticks: 0, durationTicks: midi.header.ppq * 4 })
    const file = path.join(root, 'take.mid')
    await fs.writeFile(file, midi.toArray())

    const { score } = await library.loadSong(root, await library.importScoreFile(root, file))
    assert.equal(score.source, 'midi')
    assert.equal(score.measures.length, 2)
    assert.equal(score.tempoMap[0].bpm, 90)
    const d = score.events.filter((e) => e.pitches[0].midi === 74)
    assert.deepEqual(d.map((e) => [e.measure, e.durationTick, !!e.tieStart, !!e.tieStop]), [[1, TPQ * 2, true, false], [2, TPQ * 2, false, true]])
    assert.equal(score.events.find((e) => e.pitches[0].midi === 48)?.hand, 'L')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
