// Month grid: six weeks, up to three run chips per day, and "+N more" that opens the Day view.
// Totals and the failed / critical badges come from the daily stats; chips come from the runs in the same range.
import { el } from '../core/dom.js'
import { addDays, dayKey, fmtClock, startOfMonth, startOfWeek } from '../core/time.js'
import { label, outcomeOf } from '../core/vocab.js'

const CHIPS_PER_DAY = 3
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i))

export function monthGridRange(month) {
  const from = startOfWeek(startOfMonth(month))
  return { from, to: addDays(from, 42) }
}

// stats: rows from /api/stats/daily. runs: rows from /api/runs for the same six weeks.
// onDay(date) opens that day in Day view. onOpen(id) opens the run dialog.
export function renderMonth({ month, stats, runs, onDay, onOpen }) {
  const byDate = new Map(stats.map((s) => [s.date, s]))
  const byDay = new Map()
  for (const run of [...runs].sort((a, b) => a.started_at - b.started_at)) {
    const key = dayKey(new Date(run.started_at * 1000))
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(run)
  }
  const { from } = monthGridRange(month)
  const todayKey = dayKey(new Date())
  const grid = el('div', { class: 'month-grid' })
  for (const day of WEEKDAYS) {
    grid.append(el('div', { class: 'weekday', text: day.toLocaleDateString(undefined, { weekday: 'short' }) }))
  }
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(from, i)
    const key = dayKey(date)
    const stat = byDate.get(key)
    const dayRuns = byDay.get(key) ?? []
    const shown = dayRuns.slice(0, CHIPS_PER_DAY)
    const more = Math.max(stat?.runs ?? 0, dayRuns.length) - shown.length
    const inMonth = date.getMonth() === month.getMonth()
    const dateLabel = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    grid.append(el('div', { class: `month-cell${inMonth ? '' : ' outside'}` },
      el('div', { class: 'month-head' },
        el('button', {
          type: 'button',
          class: `date-button${key === todayKey ? ' today' : ''}`,
          'aria-label': `Open ${dateLabel}`,
          title: `Open ${dateLabel}`,
          text: String(date.getDate()),
          onclick: () => onDay(date),
        }),
        stat?.failed ? el('span', { class: 'flag failed', text: `failed ${stat.failed}` }) : null,
        stat?.critical ? el('span', { class: 'flag critical', text: `critical ${stat.critical}` }) : null,
      ),
      ...shown.map((run) => chip(run, onOpen)),
      more > 0 ? el('button', { type: 'button', class: 'month-more', text: `+${more} more`, onclick: () => onDay(date) }) : null,
    ))
  }
  return grid
}

// One run: outcome dot and a text copy of the outcome for screen readers and the tooltip.
function chip(run, onOpen) {
  const outcome = outcomeOf(run)
  const title = run.task_title ?? run.lock_key ?? label(run.task_type)
  return el('button', {
    type: 'button',
    class: `chip outcome-${outcome}`,
    title: `${title} · ${label(run.task_type)} · ${label(outcome)}`,
    dataset: { runId: String(run.id) },
    onclick: () => onOpen(run.id),
  },
    el('span', { class: 'dot', 'aria-hidden': 'true' }),
    el('span', { class: 'chip-time', text: fmtClock(run.started_at) }),
    el('span', { class: 'chip-title', text: title }),
    el('span', { class: 'sr-only', text: label(outcome) }))
}
