// The dialogs that act as windows (settings, bot settings, memory, task, new task, run) get the two macOS buttons the
// main window has: close (red) and minimize (yellow). There is no zoom. Minimizing closes the dialog without clearing it
// and leaves a chip at the bottom of the screen; the chip opens it again as it was.
import { el } from './dom.js'
import { t } from './i18n.js'

const WINDOWS = ['settings-dialog', 'bot-settings', 'memory-dialog', 'task-detail', 'task-history', 'task-form', 'run-dialog']

export function initWindowControls() {
  const dock = el('div', { class: 'window-dock', 'aria-label': t('window.minimized', 'Minimized windows') })
  document.body.append(dock)
  for (const name of WINDOWS) {
    const dialog = document.querySelector(`dialog[data-area="${name}"]`)
    if (!dialog) continue
    let chip = null
    const restore = () => {
      chip?.remove()
      chip = null
      if (!dialog.open) dialog.showModal()
    }
    const minimize = () => {
      chip?.remove()
      chip = el('button', { type: 'button', class: 'window-chip', onclick: restore, text: titleOf(dialog) })
      dock.append(chip)
      dialog.close()
    }
    dialog.classList.add('windowed')
    dialog.prepend(el('div', { class: 'window-controls' },
      el('button', { type: 'button', class: 'wc wc-close', 'aria-label': t('window.close', 'Close'), title: t('window.close', 'Close'), onclick: () => dialog.close() }),
      el('button', { type: 'button', class: 'wc wc-min', 'aria-label': t('window.minimize', 'Minimize'), title: t('window.minimize', 'Minimize'), onclick: minimize })))
    // Opened again some other way (the gear, a task link): the chip has nothing left to restore.
    new MutationObserver(() => { if (dialog.open && chip) { chip.remove(); chip = null } }).observe(dialog, { attributes: true, attributeFilter: ['open'] })
  }
}

function titleOf(dialog) {
  const id = dialog.getAttribute('aria-labelledby')
  const heading = (id && document.getElementById(id)) || dialog.querySelector('h1, h2')
  return (heading?.textContent || dialog.getAttribute('aria-label') || dialog.dataset.area).trim().slice(0, 40)
}
