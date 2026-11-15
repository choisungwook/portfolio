// The database path is shown but never editable: any attempt to edit it opens a warning.
import { area } from '../core/dom.js'

let input
let warning
let path = ''

export function initDbPath() {
  input = area('settings-db-path')
  warning = area('db-path-warning')
  for (const type of ['beforeinput', 'paste', 'cut', 'drop']) {
    input.addEventListener(type, (event) => {
      event.preventDefault()
      warn()
    })
  }
  area('settings-db-change').addEventListener('click', warn)
  area('settings-db-copy').addEventListener('click', () => navigator.clipboard.writeText(path))
  warning.addEventListener('close', () => {
    input.value = path
    input.focus()
  })
}

export function showDbPath(value) {
  path = value
  input.value = value
  input.title = value
}

function warn() {
  area('db-path-warning-path').textContent = path
  if (!warning.open) warning.showModal()
}
