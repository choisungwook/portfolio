// The Weekly review page of Settings: per bot whether it ran and went well, what to turn off, and a few
// recent results to check by hand.
import { api, mutate } from '../core/api.js'
import { emit, on } from '../core/bus.js'
import { area, el, fill } from '../core/dom.js'
import { t } from '../core/i18n.js'
import { fmtDateTime } from '../core/time.js'

const pct = (rate) => (rate === null ? '—' : `${Math.round(rate * 100)}%`)
const when = (sec) => (sec ? fmtDateTime(sec) : '—')

export function initReviewSettings() {
  on('settings-page', (page) => {
    if (page === 'review') load()
  })
  area('review-days').addEventListener('change', load)
}

async function load() {
  const box = area('review-report')
  let report
  try {
    report = await api.get(`/review?days=${area('review-days').value}`)
  } catch (error) {
    fill(box, el('p', { class: 'error', text: error.message }))
    return
  }
  const head = (...cells) => el('tr', {}, ...cells.map((c) => el('th', { text: c })))
  const turnOff = (item) => mutate(() => api.put(`/bots/${item.ref}`, { enabled: false }), `${item.ref} turned off`).then(load)
  fill(box,
    el('h2', { class: 'section-title', text: t('review.prune', 'Turn off?') }),
    report.prune.length === 0 ? el('p', { class: 'meta', text: t('review.nothing', 'Nothing to prune: everything ran and went well at least once.') })
      : el('ul', { class: 'review-prune' }, ...report.prune.map((item) => el('li', {},
        el('span', { text: `${item.ref}: ${item.reason}` }),
        el('button', { type: 'button', class: 'quiet', text: t('review.turn_off', 'Turn off'), onclick: () => turnOff(item) })))),
    el('h2', { class: 'section-title', text: t('review.bots', 'Bots') }),
    el('table', { class: 'usage-table' },
      el('thead', {}, head('Bot', t('review.turns', 'Turns'), t('review.success', 'Success'), t('review.tasks', 'Tasks done / failed'), t('review.last', 'Last turn'))),
      el('tbody', {}, ...report.bots.map((b) => el('tr', {},
        el('td', { text: b.bot }), el('td', { text: String(b.turns) }), el('td', { text: pct(b.success_rate) }),
        el('td', { text: `${b.tasks_done} / ${b.tasks_failed}` }), el('td', { text: when(b.last_turn_at) }))))),
    el('h2', { class: 'section-title', text: t('review.spot', 'Check these by hand') }),
    report.spot_checks.length === 0 ? el('p', { class: 'meta', text: t('review.no_spot', 'No bot results in this period.') })
      : el('ul', { class: 'review-spot' }, ...report.spot_checks.map((s) => el('li', {},
        el('div', { class: 'conn-head' }, el('strong', { text: `${s.bot} · ${s.title}` }), el('span', { class: 'meta', text: fmtDateTime(s.at) })),
        el('p', { class: 'meta', text: s.text }),
        s.task_id ? el('button', { type: 'button', class: 'quiet', text: t('review.open_task', 'Open task'), onclick: () => emit('open-task', s.task_id) }) : null))),
  )
}
