// Settings > Database: back up (a consistent copy made by the server, downloaded through the API) and restore (the file
// uploaded in 8 MB base64 chunks, checked by the server, then swapped in by a restart). The page waits until the API
// answers with another process id (boot): the old process keeps answering while it stops its bots.
import { api, mutate, notify } from '../core/api.js'
import { area, el, fill } from '../core/dom.js'
import { on } from '../core/bus.js'
import { t } from '../core/i18n.js'
import { askConfirm } from '../core/ask.js'
import { fmtDateTime } from '../core/time.js'

const CHUNK = 6 * 1024 * 1024   // raw bytes per chunk; base64 grows it to 8 MB
const mb = (bytes) => `${(bytes / 1_000_000).toFixed(1)} MB`

export function initDbBackup() {
  on('settings-page', (page) => { if (page === 'database') loadBackups() })
  area('db-export').addEventListener('click', exportNow)
  area('db-import').addEventListener('click', () => area('db-import-file').click())
  area('db-import-file').addEventListener('change', async () => {
    const file = area('db-import-file').files?.[0]
    area('db-import-file').value = ''
    if (file) await restore(file)
  })
}

async function loadBackups() {
  try {
    const list = await api.get('/database/backups')
    fill(area('db-backups'), ...list.slice(0, 10).map((b) => el('li', {},
      el('code', { text: b.name }), el('span', { class: 'meta', text: ` ${mb(b.size)} · ${fmtDateTime(b.at)} ` }),
      el('button', { type: 'button', class: 'quiet', text: t('dbb.download', 'Download'), onclick: () => save(b.name) }))))
  } catch (error) {
    fill(area('db-backups'), el('li', { class: 'error', text: error.message }))
  }
}

async function save(name) {
  try {
    const blob = await api.blob(`/database/backups/${encodeURIComponent(name)}`)
    const url = URL.createObjectURL(blob)
    const link = el('a', { href: url, download: name })
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch (error) {
    notify(error.message, true)
  }
}

async function exportNow(event) {
  const button = event.currentTarget
  button.disabled = true
  const made = await mutate(() => api.post('/database/export', {}), t('dbb.exported', 'Backed up'))
  button.disabled = false
  if (!made) return
  await save(made.name)
  loadBackups()
}

async function restore(file) {
  if (!(await askConfirm(t('dbb.confirm', 'Replace every task, run, bot and setting with this file? The current database is kept as a backup and taskq restarts.')))) return
  const status = area('db-backup-status')
  let boot = null
  const upload = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
  try {
    for (let index = 0, offset = 0; offset < file.size || index === 0; index += 1, offset += CHUNK) {
      fill(status, el('p', { class: 'meta', text: `${t('dbb.uploading', 'Uploading')} ${Math.min(100, Math.floor((offset / Math.max(file.size, 1)) * 100))}%` }))
      const bytes = new Uint8Array(await file.slice(offset, offset + CHUNK).arrayBuffer())
      let binary = ''
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      await api.post('/database/import/chunk', { upload, index, offset, data: btoa(binary) })
      if (offset + CHUNK >= file.size) break
    }
    boot = (await api.get('/update/progress')).boot
    await api.post('/database/import', { upload })
  } catch (error) {
    fill(status, el('p', { class: 'error', text: error.message }))
    return
  }
  fill(status, el('p', { class: 'meta', text: t('dbb.restarting', 'Restored. taskq is restarting…') }))
  for (let i = 0; i < 240; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    const progress = await api.get('/update/progress').catch(() => null)
    if (progress && progress.boot !== boot) return location.reload()
  }
  fill(status, el('p', { class: 'error', text: t('update.restart_failed', 'taskq did not come back. Start it again by hand.') }))
}
