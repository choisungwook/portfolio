import type { Hand, Score, Timeline, TimelineNote } from '../core/model.ts'
import { measureToNotation, parseNotationSystem } from '../core/notation.ts'
import type { Availability, MeasureOrigin, TaskProgress } from '../core/ports.ts'
import { suggestFingering } from '../core/fingering.ts'
import { buildTimeline } from '../core/timeline.ts'
import { drawKeyboard, type KeyMark } from './keyboard.ts'
import { paintIcons, setIcon } from './icons.ts'
import { Piano3D } from './piano3d.ts'
import { loadSynth, TimelinePlayer } from './player.ts'
import { ScoreView } from './score-view.ts'

type SongSummary = { id: string; title: string; source: string; measures: number }
type Settings = { vision: 'codex' | 'claude-api'; codexPath: string; codexModel: string; claudeModel: string; hasApiKey: boolean; root: string }

declare global {
  interface Window {
    api: {
      listSongs(): Promise<SongSummary[]>
      loadSong(id: string): Promise<{ score: Score; musicxml: string; origins: MeasureOrigin[] | null }>
      importSong(): Promise<{ id: string } | null>
      saveScore(score: Score, origins?: MeasureOrigin[]): Promise<void>
      cancelTask(): Promise<void>
      onTaskProgress(listener: (p: unknown) => void): () => void
      onTaskLog(listener: (p: unknown) => void): () => void
      getSettings(): Promise<Settings>
      saveSettings(settings: Partial<Settings>): Promise<void>
      setApiKey(key: string | null): Promise<void>
      visionStatus(): Promise<Availability>
      openLibraryFolder(): Promise<void>
    }
  }
}

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector(selector) as T
const api = window.api

const state = {
  song: null as { score: Score; musicxml: string; origins: MeasureOrigin[] | null } | null,
  timeline: null as Timeline | null,
  player: null as TimelinePlayer | null,
  view: null as ScoreView | null,
  played: new Set<number>(),
  scoreStale: false,
}

// Toast at the top right, as in akbun-taskq: it stays until clicked or replaced.
function notice(message: string, error = false): void {
  const el = $('#notice')
  el.textContent = message
  if (message) el.dataset.kind = error ? 'error' : 'ok'
  else delete el.dataset.kind
}

async function guard(work: () => Promise<void>): Promise<void> {
  try {
    await work()
  } catch (error) {
    notice(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error), true)
  }
}

type View = 'library' | 'practice' | 'review' | 'settings'

function show(view: View): void {
  for (const section of document.querySelectorAll<HTMLElement>('main > section')) section.hidden = section.id !== `view-${view}`
  for (const button of document.querySelectorAll<HTMLButtonElement>('#nav [data-view]')) {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  }
  // OSMD lays the score out by its container's width; a score loaded while Practice was hidden needs a fresh layout.
  if (view === 'practice' && state.scoreStale) {
    state.scoreStale = false
    state.view?.refresh()
  }
  if (view === 'library') void guard(renderLibrary)
  if (view === 'settings') void guard(renderSettings)
}

// ---------- Library ----------

async function renderLibrary(): Promise<void> {
  const songs = await api.listSongs()
  const list = $('#song-list')
  list.replaceChildren()
  if (songs.length === 0) {
    list.innerHTML = '<p class="empty">No songs yet. Import MusicXML (.musicxml, .mxl), MIDI, or photos of the pages.</p>'
    return
  }
  for (const song of songs) {
    const row = document.createElement('button')
    row.className = 'song'
    row.innerHTML = `<strong></strong><span></span>`
    row.querySelector('strong')!.textContent = song.title
    row.querySelector('span')!.textContent = `${song.measures} measures · ${song.source}`
    row.addEventListener('click', () => void guard(() => openSong(song.id)))
    list.append(row)
  }
}

async function importSong(): Promise<void> {
  const result = await api.importSong()
  if (!result) return
  notice('Imported.')
  await openSong(result.id)
}

// ---------- Practice ----------

async function openSong(id: string, view: View = 'practice'): Promise<void> {
  state.player?.pause()
  state.song = await api.loadSong(id)
  state.timeline = buildTimeline(state.song.score)
  suggestFingering(state.timeline.notes)
  state.player = new TimelinePlayer(state.timeline)
  state.player.onPosition((p) => {
    $('#position').textContent = `m. ${p.measure}`
    // Follow the note that started last: a held note (a whole note in the left hand) started earlier and would pin the
    // cursor to the start of the measure.
    const latest = state.player!.activeNotes().reduce<TimelineNote | null>((a, b) => (!a || b.startMs > a.startMs ? b : a), null)
    if (latest) state.view?.moveTo(latest.tick)
    syncPlayButton()
    paintKeyboard()
  })
  show(view)
  $('#song-title').textContent = state.song.score.title
  const last = state.song.score.measures[state.song.score.measures.length - 1]?.number ?? 1
  const from = $<HTMLInputElement>('#loop-from')
  const to = $<HTMLInputElement>('#loop-to')
  from.max = to.max = String(last)
  from.value = String(state.song.score.measures[0]?.number ?? 1)
  to.value = String(Math.min(last, Number(from.value) + 7))
  state.view ??= new ScoreView($('#score'))
  await state.view.load(state.song.musicxml, state.song.score.ticksPerQuarter)
  state.scoreStale = view !== 'practice'
  applyControls()
  renderOmrPanel()
  paintKeyboard()
}

function hands(): Hand[] {
  return [$<HTMLInputElement>('#hand-r').checked ? 'R' : null, $<HTMLInputElement>('#hand-l').checked ? 'L' : null].filter(Boolean) as Hand[]
}

function loopRange() {
  return { fromMeasure: Number($<HTMLInputElement>('#loop-from').value), toMeasure: Number($<HTMLInputElement>('#loop-to').value) }
}

function applyControls(): void {
  const player = state.player
  if (!player) return
  const scale = Number($<HTMLInputElement>('#tempo').value)
  $('#tempo-label').textContent = `${scale.toFixed(2)}×`
  player.setTempoScale(scale)
  player.setHands(hands())
  player.setMetronome(pressed('#metronome'))
  const range = loopRange()
  const last = state.song?.score.measures[state.song.score.measures.length - 1]?.number ?? 1
  const valid = range.fromMeasure >= 1 && range.fromMeasure <= range.toMeasure && range.toMeasure <= last
  if (pressed('#loop-on') && !valid) notice(`Repeat range ${range.fromMeasure}–${range.toMeasure} is not valid; the whole piece plays.`, true)
  player.setLoop(pressed('#loop-on') && valid ? range : null)
}

let piano3d: Piano3D | null = null

// Icon toggles keep their state in aria-pressed and remember it per machine under their id.
const TOGGLES = ['#loop-on', '#metronome', '#keys-toggle', '#hands-toggle']

function pressed(id: string): boolean {
  return $(id).getAttribute('aria-pressed') === 'true'
}

function setPressed(id: string, on: boolean): void {
  $(id).setAttribute('aria-pressed', String(on))
  try {
    localStorage.setItem(`toggle${id}`, on ? 'on' : 'off')
  } catch {}
}

function restoreToggles(): void {
  for (const id of TOGGLES) {
    try {
      const saved = localStorage.getItem(`toggle${id}`)
      if (saved) $(id).setAttribute('aria-pressed', String(saved === 'on'))
    } catch {}
  }
}

function viewMode(): '2d' | '3d' {
  return $<HTMLSelectElement>('#view-mode').value === '3d' ? '3d' : '2d'
}

// 2D draws the canvas keyboard; 3D hands the same marks to the 3D piano, whose render loop picks them up.
// The piano icon hides either one so the score gets the whole height; the hand icon only matters in 3D.
function applyViewMode(): void {
  const is3d = viewMode() === '3d'
  const panel = pressed('#keys-toggle')
  try {
    localStorage.setItem('view-mode', viewMode())
  } catch {}
  $('#keyboard').hidden = is3d || !panel
  $('#piano3d').hidden = !is3d || !panel
  $('#hands-toggle').hidden = !is3d || !panel
  $('#view-mode').hidden = !panel
  if (is3d && panel) {
    piano3d ??= new Piano3D($('#piano3d'))
    piano3d.setHandsVisible(pressed('#hands-toggle'))
    piano3d.start()
  } else piano3d?.stop()
  paintKeyboard()
}

function paintKeyboard(): void {
  const ms = state.player?.position ?? 0
  const marks: KeyMark[] = (state.player?.activeNotes() ?? []).map((n) => ({
    pitch: n.pitch, hand: n.hand, finger: n.finger, progress: (ms - n.startMs) / n.durationMs, tone: 'guide',
  }))
  for (const pitch of state.played) marks.push({ pitch, tone: 'played' })
  if (viewMode() === '3d') piano3d?.setMarks(marks)
  else drawKeyboard($<HTMLCanvasElement>('#keyboard'), marks)
}

async function togglePlay(): Promise<void> {
  const player = state.player
  if (!player) return
  await loadSynth()
  if (player.playing) {
    player.pause()
  } else {
    applyControls()
    player.setMuted(false)
    player.play()
  }
  syncPlayButton()
}

// The play button shows what a click will do, and follows the player when it stops by itself at the end.
function syncPlayButton(): void {
  const button = $('#play')
  const next = state.player?.playing ? 'pause' : 'play'
  if (button.dataset.icon === next) return
  button.dataset.icon = next
  button.setAttribute('aria-label', next === 'play' ? 'Play' : 'Pause')
  button.classList.toggle('playing', next === 'pause')
  setIcon(button, next)
}

// ---------- MIDI input ----------

let midiAccess: MIDIAccess | null = null

async function setupMidi(): Promise<void> {
  const select = $<HTMLSelectElement>('#midi-device')
  try {
    if (!navigator.requestMIDIAccess) throw new Error('Web MIDI is not available.')
    midiAccess = await navigator.requestMIDIAccess()
  } catch (error) {
    // Say it in the selector itself, so an empty box never stands there unexplained.
    select.replaceChildren(new Option('Not available', ''))
    select.disabled = true
    throw error
  }
  const refresh = () => {
    const current = select.value
    select.replaceChildren(new Option('No MIDI input', ''))
    for (const input of midiAccess!.inputs.values()) select.append(new Option(input.name ?? input.id, input.id))
    select.value = [...select.options].some((o) => o.value === current) ? current : (select.options[1]?.value ?? '')
    connectMidi()
  }
  midiAccess.onstatechange = refresh
  select.addEventListener('change', connectMidi)
  refresh()
}

function connectMidi(): void {
  const id = $<HTMLSelectElement>('#midi-device').value
  for (const input of midiAccess?.inputs.values() ?? []) input.onmidimessage = input.id === id ? onMidiMessage : null
}

function onMidiMessage(message: MIDIMessageEvent): void {
  const [status, data1, data2] = message.data ?? []
  const type = status & 0xf0
  if (type === 0x90 && data2 > 0) state.played.add(data1)
  else if (type === 0x80 || (type === 0x90 && data2 === 0)) state.played.delete(data1)
  else return
  paintKeyboard()
}

// ---------- OMR review ----------

const STATUS_LABEL: Record<string, string> = { ok: 'ok', invalid: 'check failed', uncertain: 'uncertain', disagree: 'disagree', 'user-edited': 'edited' }

function renderOmrPanel(): void {
  const origins = state.song?.origins
  $('#nav-review').hidden = !origins
  const list = $('#omr-list')
  list.replaceChildren()
  if (!origins) return
  for (const origin of origins) {
    const item = document.createElement('div')
    item.className = `omr-measure status-${origin.status}`
    const head = document.createElement('div')
    head.textContent = `m. ${origin.measureNumber} · page ${origin.page} · ${STATUS_LABEL[origin.status]}${origin.issues.length ? ` · ${origin.issues.join('; ')}` : ''}`
    const text = document.createElement('textarea')
    text.value = JSON.stringify(origin.notation)
    text.rows = 2
    const apply = document.createElement('button')
    apply.textContent = 'Apply'
    apply.addEventListener('click', () => void guard(() => applyMeasureEdit(origin, text.value)))
    item.append(head, text, apply)
    list.append(item)
  }
}

// Re-parses one measure from edited notation and replaces its events. The measure keeps its key, time and position.
async function applyMeasureEdit(origin: MeasureOrigin, text: string): Promise<void> {
  const song = state.song!
  const score = song.score
  const measure = score.measures.find((m) => m.number === origin.measureNumber)!
  const staves = JSON.parse(text) as Record<string, Record<string, string>>
  const parsed = parseNotationSystem(
    { measureCount: 1, measures: [{ number: measure.number, staves }] },
    { key: measure.key, time: measure.time, clefs: measure.clefs, octaveShift: measure.octaveShift ?? { 1: 0, 2: 0 }, nextTick: measure.startTick, measuresSoFar: measure.isPickup ? 0 : 1 },
  )
  const problems = parsed.issues.filter((i) => i.kind !== 'range')
  if (problems.length) throw new Error(problems.map((i) => i.message).join('; '))
  score.events = [...score.events.filter((e) => e.measure !== measure.number), ...parsed.events].sort((a, b) => a.startTick - b.startTick)
  origin.status = 'user-edited'
  origin.issues = []
  origin.notation = measureToNotation(parsed.events)
  await api.saveScore(score, song.origins ?? undefined)
  notice(`Measure ${measure.number} saved.`)
  await openSong(score.id, 'review')
}

// ---------- Settings ----------

async function renderSettings(): Promise<void> {
  const settings = await api.getSettings()
  $<HTMLSelectElement>('#set-vision').value = settings.vision
  $<HTMLInputElement>('#set-codex-path').value = settings.codexPath
  $<HTMLInputElement>('#set-codex-model').value = settings.codexModel
  $<HTMLInputElement>('#set-claude-model').value = settings.claudeModel
  $<HTMLInputElement>('#set-api-key').placeholder = settings.hasApiKey ? 'Saved in the OS keychain' : 'sk-ant-…'
  $('#set-root').textContent = settings.root
  const status = await api.visionStatus()
  $('#set-status').textContent = status.ok ? 'Ready' : status.hint
}

async function saveSettings(): Promise<void> {
  await api.saveSettings({
    vision: $<HTMLSelectElement>('#set-vision').value as Settings['vision'],
    codexPath: $<HTMLInputElement>('#set-codex-path').value,
    codexModel: $<HTMLInputElement>('#set-codex-model').value,
    claudeModel: $<HTMLInputElement>('#set-claude-model').value,
  })
  const key = $<HTMLInputElement>('#set-api-key')
  if (key.value) {
    await api.setApiKey(key.value)
    key.value = ''
  }
  notice('Settings saved.')
  await renderSettings()
}

// ---------- Wiring ----------

function wire(): void {
  $('#notice').addEventListener('click', () => notice(''))
  for (const button of document.querySelectorAll<HTMLButtonElement>('#nav [data-view]')) {
    button.addEventListener('click', () => show(button.dataset.view as View))
  }
  $('#import').addEventListener('click', () => void guard(importSong))
  $('#open-folder').addEventListener('click', () => void api.openLibraryFolder())
  $('#play').addEventListener('click', () => void guard(togglePlay))
  for (const id of ['#tempo', '#hand-r', '#hand-l', '#loop-from', '#loop-to']) {
    $(id).addEventListener('input', applyControls)
  }
  for (const id of ['#loop-on', '#metronome']) {
    $(id).addEventListener('click', () => {
      setPressed(id, !pressed(id))
      applyControls()
    })
  }
  $('#keys-toggle').addEventListener('click', () => {
    setPressed('#keys-toggle', !pressed('#keys-toggle'))
    applyViewMode()
  })
  $('#hands-toggle').addEventListener('click', () => {
    setPressed('#hands-toggle', !pressed('#hands-toggle'))
    piano3d?.setHandsVisible(pressed('#hands-toggle'))
  })
  $('#loop-from').addEventListener('change', () => state.player?.seekMeasure(loopRange().fromMeasure))
  $('#view-mode').addEventListener('change', applyViewMode)
  $('#settings-save').addEventListener('click', () => void guard(saveSettings))
  $('#settings-clear-key').addEventListener('click', () => void guard(async () => {
    await api.setApiKey(null)
    await renderSettings()
  }))
  $('#task-cancel').addEventListener('click', () => void api.cancelTask())
  api.onTaskProgress((value) => {
    const p = value as TaskProgress | null
    $('#task').hidden = !p
    if (p) {
      $('#task-message').textContent = p.message ?? p.stage
      $<HTMLProgressElement>('#task-bar').value = p.ratio ?? 0
    }
  })
  api.onTaskLog((value) => {
    const log = value as { level: string; message: string }
    if (log.level !== 'info') notice(log.message, log.level === 'error')
  })
  window.addEventListener('resize', paintKeyboard)
  window.addEventListener('keydown', (event) => {
    // Space plays only on the practice screen, and leaves form controls (and a focused button's own click) alone.
    const target = event.target
    const control = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLButtonElement
    if (event.code === 'Space' && !control && !$('#view-practice').hidden) {
      event.preventDefault()
      void guard(togglePlay)
    }
  })
}

paintIcons()
wire()
try {
  $<HTMLSelectElement>('#view-mode').value = localStorage.getItem('view-mode') === '3d' ? '3d' : '2d'
} catch {}
restoreToggles()
show('library')
applyViewMode()
void guard(setupMidi)
