// Day and Week time grid: a sticky day header, an hour gutter, hairline hours, overlapping blocks and the current-time line.
// Overlapping runs share their cluster's width (layout-overlap). Waits are hatched overlays on the column.
import { el } from '../core/dom.js'
import { HOUR, addDays, dayKey, fmtClock, toEpoch } from '../core/time.js'
import { label, outcomeOf } from '../core/vocab.js'
import { layoutRuns } from '../pure/layout-overlap.js'

export const HOUR_PX = 48
// A block is drawn at least 20 minutes tall. The layout uses the same minimum span, so a short block never covers the next run.
const MIN_BLOCK_SECONDS = 20 * 60
const MIN_BLOCK_PX = (MIN_BLOCK_SECONDS / HOUR) * HOUR_PX
// One 12 px text line is 14 px tall. Lines that do not fit are left out, never drawn over each other.
const LINE_PX = 14
const BLOCK_PAD_PX = 2
const GAP_PX = 2
const DAY_HEIGHT = 24 * HOUR_PX
const COLUMN_MIN = 96
const hourFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric' })
const hourLabel = (h) => hourFormat.format(new Date(2000, 0, 1, h))

// days: local-midnight Dates. onDay(date) opens that day in Day view. onOpen(id) opens the run dialog.
export function renderTimeGrid({ days, runs, now, onDay, onOpen }) {
  const grid = el('div', { class: 'time-grid', dataset: { view: days.length > 1 ? 'week' : 'day' } })
  const columns = `56px repeat(${days.length}, minmax(${COLUMN_MIN}px, 1fr))`
  const head = el('div', { class: 'time-head', style: { gridTemplateColumns: columns } }, el('div', { class: 'gutter' }))
  const hours = el('div', { class: 'hours', style: { height: `${DAY_HEIGHT}px` } })
  for (let h = 0; h < 24; h += 1) {
    hours.append(el('span', { class: h === 0 ? 'hour-label first' : 'hour-label', style: { top: `${h * HOUR_PX}px` }, text: hourLabel(h) }))
  }
  const body = el('div', { class: 'time-body', style: { gridTemplateColumns: columns } }, el('div', { class: 'gutter' }, hours))

  const nowDay = dayKey(new Date(now * 1000))
  for (const day of days) {
    const from = toEpoch(day)
    const to = toEpoch(addDays(day, 1))
    const isToday = dayKey(day) === nowDay
    const weekend = day.getDay() === 0 || day.getDay() === 6
    head.append(dayHead(day, isToday, onDay))
    const column = el('div', {
      class: `day-col${weekend ? ' weekend' : ''}${isToday ? ' today' : ''}`,
      style: { height: `${DAY_HEIGHT}px` },
    })
    const items = layoutRuns(runs, { now, from, to, minSeconds: MIN_BLOCK_SECONDS })
    for (const item of items) column.append(...waitOverlays(item, from, to, now))
    for (const item of items) column.append(block(item, from, onOpen))
    if (isToday) column.append(nowLine(now, from))
    body.append(column)
  }
  grid.append(head, body)
  return grid
}

// Scrolls so the current time (or 8 AM when today is not in the range) sits about one third from the top of the visible grid.
export function revealTime(grid, days, now) {
  const today = dayKey(new Date(now * 1000))
  const day = days.find((d) => dayKey(d) === today)
  const y = day ? ((now - toEpoch(day)) / HOUR) * HOUR_PX : 8 * HOUR_PX
  const headHeight = grid.querySelector('.time-head').offsetHeight
  grid.scrollTop = Math.max(0, y - (grid.clientHeight - headHeight) / 3)
}

function dayHead(day, isToday, onDay) {
  const full = day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  return el('button', { type: 'button', class: 'day-head', title: `Open ${full}`, 'aria-label': `Open ${full}`, onclick: () => onDay(day) },
    el('span', { class: 'dow', text: day.toLocaleDateString(undefined, { weekday: 'short' }) }),
    el('span', { class: `dom${isToday ? ' today' : ''}`, text: String(day.getDate()) }))
}

function nowLine(now, dayFrom) {
  return el('div', {
    class: 'now-line',
    dataset: { area: 'now-line' },
    style: { top: `${((now - dayFrom) / HOUR) * HOUR_PX}px` },
    'aria-hidden': 'true',
  })
}

// Horizontal placement inside the day column: one slot per overlap column, 2 px apart.
function place(column, columns) {
  return { left: `calc(${(column / columns) * 100}% + 1px)`, width: `calc(${100 / columns}% - ${GAP_PX}px)` }
}

function block(item, dayFrom, onOpen) {
  const { run, column, columns, start, end, runEnd } = item
  const outcome = outcomeOf(run)
  const title = run.task_title ?? run.lock_key ?? label(run.task_type)
  const height = Math.max(MIN_BLOCK_PX, ((end - start) / HOUR) * HOUR_PX)
  const time = `${fmtClock(start)} – ${run.ended_at === null ? 'now' : fmtClock(runEnd)}`
  const lines = [
    el('span', { class: 'block-title', text: title }),
    el('span', { class: 'block-time', text: `${time} · ${label(outcome)}` }),
    el('span', { class: 'block-type', text: label(run.task_type) }),
  ]
  const fits = Math.max(1, Math.floor((height - BLOCK_PAD_PX) / LINE_PX))
  return el('button', {
    type: 'button',
    class: `block outcome-${outcome}`,
    title: `${title} · ${label(run.task_type)} · ${run.lock_key ?? 'no account or repo'} · ${label(outcome)}`,
    dataset: { runId: String(run.id) },
    style: { top: `${((start - dayFrom) / HOUR) * HOUR_PX}px`, height: `${height}px`, ...place(column, columns) },
    onclick: () => onOpen(run.id),
  }, el('span', { class: 'sr-only', text: label(outcome) }), ...lines.slice(0, fits))
}

// Hatched overlay per wait, clipped to the visible day. A wait that began on an earlier day still shows from midnight.
function waitOverlays(item, dayFrom, dayTo, now) {
  const { run, column, columns } = item
  const { left, width } = place(column, columns)
  return (run.waits ?? []).flatMap((wait) => {
    const from = Math.max(wait.from, dayFrom)
    const to = Math.min(wait.to ?? now, dayTo)
    if (to <= from) return []
    const outcome = wait.kind === 'approval' ? 'needs_approval' : 'needs_auth'
    return [el('div', {
      class: `wait wait-${wait.kind}`,
      title: `Waiting for you: ${label(outcome)}`,
      style: {
        top: `${((from - dayFrom) / HOUR) * HOUR_PX}px`,
        height: `${Math.max(4, ((to - from) / HOUR) * HOUR_PX)}px`,
        left,
        width,
      },
    })]
  })
}
