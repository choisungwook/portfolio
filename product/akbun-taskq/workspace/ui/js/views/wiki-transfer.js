// Wiki export and import in the Wiki view. Both run as background jobs: the list under the toolbar shows each job's
// progress, with Cancel while it runs and Resume (from the last step) after a cancel or a failure. A finished export
// links its zip in the shared folder.
import { api, mutate, notify } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { on } from '../core/bus.js'
import { t } from '../core/i18n.js'
import { fmtDateTime } from '../core/time.js'
import { download } from './bot-chat.js'

const POLL_MS = 1500
let timer
let box

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function initWikiTransfer() {
  const view = area('wiki')
  const picker = el('input', { type: 'file', accept: '.zip,.md,.markdown,.txt,.html,.htm', hidden: true })
  const folder = el('input', { type: 'text', placeholder: t('wiki.folder_path', 'or an absolute folder path'), spellcheck: 'false', 'aria-label': t('wiki.folder_path', 'or an absolute folder path') })
  const name = el('input', { type: 'text', maxlength: 60, placeholder: t('wiki.batch', 'name (optional)'), 'aria-label': t('wiki.batch', 'name (optional)') })
  const importForm = el('form', { class: 'wiki-import', hidden: true },
    el('button', { type: 'button', text: t('wiki.pick_zip', 'Upload a zip or file…'), onclick: () => picker.click() }), folder, name,
    el('button', { type: 'submit', class: 'primary', text: t('wiki.start_import', 'Import') }))
  importForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!folder.value.trim()) {
      notify(t('wiki.need_source', 'Upload a zip or type a folder path'), true)
      return
    }
    await start(folder.value.trim(), name.value.trim())
  })
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0]
    picker.value = ''
    if (!file) return
    try {
      const saved = await api.post('/files', { name: file.name, data: await toBase64(file) })
      await start(saved.path, name.value.trim())
    } catch (error) {
      notify(error.message, true)
    }
  })
  box = el('ul', { class: 'job-list', 'aria-live': 'polite' })
  const toolbar = el('div', { class: 'wiki-tools' },
    el('button', { type: 'button', text: t('wiki.export', 'Export zip'), onclick: async () => {
      if (await mutate(() => api.post('/bots/wiki/export'), t('wiki.export_started', 'Export started'))) refresh()
    } }),
    el('button', { type: 'button', text: t('wiki.import', 'Import…'), onclick: () => { importForm.hidden = !importForm.hidden } }),
  )
  view.querySelector('.view-title').after(toolbar, importForm, picker, box)

  async function start(source, batch) {
    if (await mutate(() => api.post('/bots/wiki/import', { source, name: batch }), t('wiki.import_started', 'Import started'))) {
      importForm.hidden = true
      folder.value = ''
      refresh()
    }
  }

  on('tab', (tab) => {
    clearInterval(timer)
    if (tab !== 'wiki') return
    refresh()
    timer = setInterval(refresh, POLL_MS)
  })
}

async function refresh() {
  let jobs
  try {
    jobs = (await api.get('/jobs?limit=6')).filter((j) => j.kind.startsWith('wiki_'))
  } catch {
    return
  }
  clear(box).append(...jobs.map(row))
}

function row(job) {
  const pct = job.total ? Math.round((job.done / job.total) * 100) : job.status === 'done' ? 100 : 0
  const label = job.kind === 'wiki_export' ? t('wiki.export', 'Export zip') : `${t('wiki.import', 'Import…').replace('…', '')} ${job.params.source ?? ''}`
  return el('li', { class: 'job', dataset: { status: job.status } },
    el('div', { class: 'job-head' },
      el('strong', { text: label }),
      el('span', { class: 'wf-status', dataset: { status: job.status === 'done' ? 'succeeded' : job.status }, text: t(`job.${job.status}`, job.status) }),
      el('span', { class: 'meta', text: fmtDateTime(job.created_at) })),
    el('div', { class: 'job-bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, el('span', { style: { width: `${pct}%` } })),
    el('p', { class: 'meta', text: `${job.done}${job.total ? `/${job.total}` : ''} · ${job.error ?? job.message ?? ''}` }),
    el('div', { class: 'job-actions' },
      job.status === 'running' || job.status === 'queued' ? el('button', { type: 'button', class: 'danger-quiet', text: t('job.cancel', 'Cancel'), onclick: () => act(job, 'cancel') }) : null,
      job.status === 'cancelled' || job.status === 'failed' ? el('button', { type: 'button', text: t('job.resume', 'Resume from the last step'), onclick: () => act(job, 'resume') }) : null,
      job.status === 'done' && job.result?.path ? el('button', { type: 'button', text: `${t('job.download', 'Download')} (${Math.round(job.result.bytes / 1024)} KB)`, onclick: () => download(job.result.path) }) : null,
      job.status === 'done' && job.result?.pages !== undefined && job.kind === 'wiki_import' ? el('span', { class: 'meta', text: `${job.result.pages} ${t('job.pages', 'pages')}, ${job.result.skipped} ${t('job.skipped', 'skipped')}` }) : null,
    ))
}

async function act(job, action) {
  if (await mutate(() => api.post(`/jobs/${job.id}/${action}`))) refresh()
}
