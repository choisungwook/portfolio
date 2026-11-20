// Yes/no and one-line questions as a <dialog>. A webview that is not a browser (the desktop app) answers the native
// confirm and prompt with false and null without showing anything, so the UI never calls them.
import { el } from './dom.js'
import { t } from './i18n.js'

function open(text, withInput) {
  return new Promise((resolve) => {
    const field = withInput ? el('input', { type: 'text', 'aria-label': text }) : null
    const dialog = el('dialog', { class: 'ask-dialog' },
      el('form', { method: 'dialog', class: 'dialog-body' },
        el('p', { text }),
        field,
        el('div', { class: 'dialog-actions' },
          el('span', { class: 'spacer' }),
          el('button', { type: 'submit', value: 'cancel', text: t('ask.cancel', 'Cancel') }),
          el('button', { type: 'submit', value: 'ok', class: 'primary', autofocus: !withInput, text: t('ask.ok', 'OK') }))))
    dialog.addEventListener('close', () => {
      const ok = dialog.returnValue === 'ok'
      dialog.remove()
      resolve(withInput ? (ok ? field.value : null) : ok)
    })
    document.body.append(dialog)
    dialog.showModal()
    field?.focus()
  })
}

// Resolves true on OK, false on Cancel or Esc.
export const askConfirm = (text) => open(text, false)
// Resolves the typed text on OK, null on Cancel or Esc.
export const askText = (text) => open(text, true)
