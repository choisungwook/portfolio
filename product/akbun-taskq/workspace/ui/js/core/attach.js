// Attachments for a form: drop files on the zone, paste them (screenshots included), or pick them with the button.
// Each file is uploaded at once (POST /api/files, base64 in JSON) and shows as a chip; files() returns the stored paths.
import { api, notify } from './api.js'
import { clear, el } from './dom.js'
import { icon } from './icons.js'

const LIMIT = 20 * 1024 * 1024
// A folder is for a handful of documents, not a repository checkout.
const FOLDER_FILES = 200
const SKIP = /(^|\/)(\.git|node_modules)\//

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function attachments({ zone, button, chips, pasteTarget }) {
  let items = []
  const picker = el('input', { type: 'file', multiple: true, hidden: true })
  // A folder attaches every file in it (webkitdirectory works in Chrome, Safari and Firefox).
  const folderPicker = el('input', { type: 'file', multiple: true, hidden: true, webkitdirectory: true })
  zone.append(picker, folderPicker)

  const render = () => {
    chips.hidden = items.length === 0
    clear(chips).append(...items.map((item) => el('span', { class: 'attach-chip', dataset: { state: item.state } },
      el('span', { text: item.name }),
      item.state === 'uploading' ? el('span', { class: 'meta', text: ' …' }) : null,
      el('button', { type: 'button', class: 'attach-remove', 'aria-label': `Remove ${item.name}`, onclick: () => {
        items = items.filter((other) => other !== item)
        render()
      } }, icon('close', 14)))))
  }

  async function add(files) {
    for (const file of files) {
      if (file.size > LIMIT) {
        notify(`${file.name}: a file may be at most 20 MB`, true)
        continue
      }
      // A file from a folder keeps its place in the name (a/b/c.md -> a__b__c.md), so same-named files stay apart.
      const name = file.webkitRelativePath ? file.webkitRelativePath.replaceAll('/', '__') : file.name || `pasted-${Date.now()}.${(file.type.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '')}`
      const item = { name, state: 'uploading', path: null }
      items.push(item)
      render()
      try {
        const saved = await api.post('/files', { name, data: await toBase64(file) })
        item.path = saved.path
        item.state = 'ready'
      } catch (error) {
        items = items.filter((other) => other !== item)
        notify(`${name}: ${error.message}`, true)
      }
      render()
    }
  }

  button?.addEventListener('click', () => picker.click())
  picker.addEventListener('change', () => {
    add([...picker.files])
    picker.value = ''
  })
  folderPicker.addEventListener('change', () => {
    const files = [...folderPicker.files].filter((file) => !SKIP.test(file.webkitRelativePath))
    folderPicker.value = ''
    if (files.length > FOLDER_FILES) {
      notify(`A folder may hold at most ${FOLDER_FILES} files (without .git and node_modules); this one has ${files.length}`, true)
      return
    }
    add(files)
  })
  zone.addEventListener('dragover', (event) => {
    if (![...event.dataTransfer.types].includes('Files')) return
    event.preventDefault()
    zone.dataset.dragging = 'true'
  })
  zone.addEventListener('dragleave', (event) => {
    if (!zone.contains(event.relatedTarget)) delete zone.dataset.dragging
  })
  zone.addEventListener('drop', (event) => {
    if (!event.dataTransfer.files.length) return
    event.preventDefault()
    delete zone.dataset.dragging
    add([...event.dataTransfer.files])
  })
  ;(pasteTarget ?? zone).addEventListener('paste', (event) => {
    const files = [...(event.clipboardData?.files ?? [])]
    if (files.length === 0) return
    event.preventDefault()
    add(files)
  })

  return {
    files: () => items.filter((item) => item.path).map((item) => item.path),
    pick: () => picker.click(),
    pickFolder: () => folderPicker.click(),
    busy: () => items.some((item) => item.state === 'uploading'),
    clear: () => {
      items = []
      render()
    },
  }
}
