import type { KeyboardEvent } from 'react'

interface ClickableProps {
  role: 'button'
  tabIndex: 0
  onClick: () => void
  onKeyDown: (event: KeyboardEvent) => void
}

/** Makes a non-button row behave like a button for both mouse and keyboard. */
export function clickable(onActivate: () => void): ClickableProps {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      onActivate()
    }
  }
}
