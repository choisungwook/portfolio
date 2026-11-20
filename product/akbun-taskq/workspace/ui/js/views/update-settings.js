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

async function install(event) {
  const button = event.currentTarget
  button.disabled = true
  const done = await mutate(() => api.post('/update'))
  const box = area('update-status')
  if (done) {
    clear(box).append(el('p', { text: `${t('update.installed', 'Installed')} ${done.installed}. ${t('update.restart', 'Restart taskq (stop taskq run and start it again) to use it.')}` }))
    showActions()
  }
  else button.disabled = false
}
