// Debounced refresh. Any number of change signals become one 'refresh' broadcast. Nothing is sent without a token.
import { emit } from './bus.js'
import { hasAccess } from './token.js'

let timer = null

export function requestRefresh() {
  if (timer !== null || !hasAccess()) return
  timer = setTimeout(() => {
    timer = null
    emit('refresh')
  }, 250)
}
