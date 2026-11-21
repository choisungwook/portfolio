// Settings > Update: the running version, the newest release, and Install for the single-file binary. Checked when the
// page opens; installing replaces the binary and the new version starts with the next `taskq run`.
import { api, mutate } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { on } from '../core/bus.js'
import { t } from '../core/i18n.js'

export function initUpdateSettings() {
  on('settings-page', (page) => {
    if (page === 'update') check()
  })
  area('update-check').addEventListener('click', check)
}

// Install, the release notes and Check again share one row, so the actions line up instead of running into each other.
function showActions(...nodes) {
  const row = area('update-actions')
  const again = area('update-check')
  clear(row).append(...nodes.filter(Boolean), again)
}

async function check() {
  const box = area('update-status')
  clear(box).append(el('p', { class: 'meta', text: t('update.checking', 'Checking…') }))
  showActions()
  try {
    const s = await api.get('/update')
    clear(box).append(...[
      el('p', { text: `${t('update.current', 'Installed')}: ${s.current} · ${t('update.latest', 'Latest')}: ${s.latest ?? '—'}` }),
      el('p', { class: 'meta', text: s.update_available ? t('update.available', 'A newer version is available.') : t('update.none', 'taskq is up to date.') }),
      s.reason && s.update_available ? el('p', { class: 'meta', text: s.reason }) : null,
    ].filter(Boolean))
    showActions(
      s.can_install ? el('button', { type: 'button', class: 'primary', text: `${t('update.install', 'Install')} ${s.latest}`, onclick: install }) : null,
      s.release_url ? el('a', { class: 'button', href: s.release_url, target: '_blank', rel: 'noopener noreferrer', text: t('update.notes', 'Release notes') }) : null,
    )
  } catch (error) {
    clear(box).append(el('p', { class: 'error', text: error.message }))
  }
}

// Install shows a bar under the status with the percent downloaded, read from GET /update/progress while the install
// request is still running. Without a length from GitHub the bar has no value and only moves.
async function install(event) {
  const button = event.currentTarget
  button.disabled = true
  const box = area('update-status')
  const bar = el('progress', { class: 'update-bar', max: '100', 'aria-label': t('update.progress', 'Install progress') })
  const label = el('span', { class: 'meta', text: t('update.downloading', 'Downloading…') })
  const meter = el('div', { class: 'update-progress', role: 'status', 'aria-live': 'polite' }, bar, label)
  box.append(meter)
  const poll = setInterval(async () => {
    const p = await api.get('/update/progress').catch(() => null)
    if (p) showProgress(bar, label, p)
  }, 250)
  const done = await mutate(() => api.post('/update'))
  clearInterval(poll)
  meter.remove()
  if (done) {
    clear(box).append(el('p', { text: `${t('update.installed', 'Installed')} ${done.installed}. ${t('update.restart', 'Restart taskq (stop taskq run and start it again) to use it.')}` }))
    showActions()
  }
  else button.disabled = false
}

function showProgress(bar, label, p) {
  if (p.phase === 'unpack') {
    bar.value = 100
    label.textContent = `100% · ${t('update.unpacking', 'Unpacking…')}`
  } else if (p.phase === 'download' && p.total) {
    const percent = Math.min(100, Math.floor((p.received / p.total) * 100))
    bar.value = percent
    label.textContent = `${percent}% · ${mb(p.received)} / ${mb(p.total)} MB`
  } else if (p.phase === 'download') {
    bar.removeAttribute('value')
    label.textContent = `${t('update.downloading', 'Downloading…')} ${mb(p.received)} MB`
  }
}

const mb = (bytes) => (bytes / 1_000_000).toFixed(1)
