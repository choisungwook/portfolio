// The song library on disk (~/PianoCoach). Plain JSON and MusicXML files so they can be read and fixed by hand.
// library/<songId>/{source/, score.musicxml, score.json, omr/}
// No electron import: tests and scripts use it directly.

import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { DOMParser } from '@xmldom/xmldom'
import ToneMidi from '@tonejs/midi'
import JSZip from 'jszip'
import type { Score } from '../core/model.ts'
import { midiToScore } from '../core/midi-file.ts'
import { parseMusicXml, writeMusicXml } from '../core/musicxml.ts'
import { recognizePages } from '../core/omr.ts'
import type { MeasureOrigin, TaskContext, VisionLlm, VisionUsage } from '../core/ports.ts'

export type SongSummary = { id: string; title: string; source: Score['source']; measures: number }

export const IMPORT_EXTENSIONS = { musicxml: ['musicxml', 'xml', 'mxl'], midi: ['mid', 'midi'], images: ['png', 'jpg', 'jpeg', 'webp'] }

const songDir = (root: string, id: string) => path.join(root, 'library', id)

function newId(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'song'
  return `${slug}-${randomUUID().slice(0, 6)}`
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(value, null, 2))
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T
}

async function saveSong(root: string, score: Score, musicxml: string, sources: string[]): Promise<string> {
  const dir = songDir(root, score.id)
  await fs.mkdir(path.join(dir, 'source'), { recursive: true })
  for (const file of sources) await fs.copyFile(file, path.join(dir, 'source', path.basename(file)))
  await fs.writeFile(path.join(dir, 'score.musicxml'), musicxml)
  await writeJson(path.join(dir, 'score.json'), score)
  return score.id
}

async function readMxl(file: string): Promise<string> {
  const zip = await JSZip.loadAsync(await fs.readFile(file))
  const container = await zip.file('META-INF/container.xml')?.async('string')
  const rootPath = container?.match(/full-path="([^"]+)"/)?.[1] ?? Object.keys(zip.files).find((name) => !name.startsWith('META-INF') && name.endsWith('.xml'))
  const xml = rootPath ? await zip.file(rootPath)?.async('string') : undefined
  if (!xml) throw new Error('no score inside the .mxl file')
  return xml
}

export function parseMusicXmlText(xml: string, id: string): Score {
  return parseMusicXml(new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document, id)
}

export async function importScoreFile(root: string, file: string): Promise<string> {
  const ext = path.extname(file).slice(1).toLowerCase()
  const fallbackTitle = path.basename(file, path.extname(file))
  if (IMPORT_EXTENSIONS.musicxml.includes(ext)) {
    const xml = ext === 'mxl' ? await readMxl(file) : await fs.readFile(file, 'utf8')
    const score = parseMusicXmlText(xml, '')
    if (score.title === 'Untitled') score.title = fallbackTitle
    score.id = newId(score.title)
    return saveSong(root, score, xml, [file])
  }
  if (IMPORT_EXTENSIONS.midi.includes(ext)) {
    const midi = new ToneMidi.Midi(await fs.readFile(file))
    const score = midiToScore(midi, '', fallbackTitle)
    score.id = newId(score.title)
    return saveSong(root, score, writeMusicXml(score), [file])
  }
  throw new Error(`cannot import .${ext}; use MusicXML, MIDI or page images`)
}

export async function importImages(root: string, files: string[], title: string, llm: VisionLlm, ctx: TaskContext) {
  const id = newId(title)
  const omrDir = path.join(songDir(root, id), 'omr')
  const cacheDir = path.join(root, 'cache', 'omr')
  await fs.mkdir(cacheDir, { recursive: true })
  const cacheFile = (key: string) => path.join(cacheDir, `${createHash('sha256').update(key).digest('hex')}.txt`)
  const cache = {
    get: (key: string) => fs.readFile(cacheFile(key), 'utf8').catch(() => undefined),
    set: (key: string, text: string) => fs.writeFile(cacheFile(key), text),
  }
  const pages = await Promise.all(files.map(async (file) => ({ path: file, hash: createHash('sha256').update(await fs.readFile(file)).digest('hex') })))
  const result = await recognizePages(pages, llm, cache, ctx, title)
  result.score.id = id
  await saveSong(root, result.score, writeMusicXml(result.score), files)
  await writeJson(path.join(omrDir, 'origins.json'), { engine: llm.id, model: llm.modelId, usage: result.usage, origins: result.origins })
  return { id, origins: result.origins, usage: result.usage }
}

export async function listSongs(root: string): Promise<SongSummary[]> {
  const dir = path.join(root, 'library')
  const names = await fs.readdir(dir).catch(() => [] as string[])
  const songs: SongSummary[] = []
  for (const id of names) {
    const score = await readJson<Score>(path.join(dir, id, 'score.json')).catch(() => null)
    if (!score) continue
    songs.push({ id, title: score.title, source: score.source, measures: score.measures.length })
  }
  return songs.sort((a, b) => a.title.localeCompare(b.title))
}

export async function loadSong(root: string, id: string) {
  const dir = songDir(root, id)
  const [score, musicxml, omr] = await Promise.all([
    readJson<Score>(path.join(dir, 'score.json')),
    fs.readFile(path.join(dir, 'score.musicxml'), 'utf8'),
    readJson<{ origins: MeasureOrigin[]; usage: VisionUsage }>(path.join(dir, 'omr', 'origins.json')).catch(() => null),
  ])
  return { score, musicxml, origins: omr?.origins ?? null }
}

// Replaces the score after an edit (OMR review) and keeps MusicXML in step with it.
export async function saveScore(root: string, score: Score, origins?: MeasureOrigin[]): Promise<void> {
  const dir = songDir(root, score.id)
  await writeJson(path.join(dir, 'score.json'), score)
  await fs.writeFile(path.join(dir, 'score.musicxml'), writeMusicXml(score))
  if (origins) {
    const file = path.join(dir, 'omr', 'origins.json')
    const current = await readJson<Record<string, unknown>>(file).catch(() => ({}))
    await writeJson(file, { ...current, origins })
  }
}
