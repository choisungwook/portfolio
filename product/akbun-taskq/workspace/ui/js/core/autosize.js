// A textarea that grows with its text up to a limit and then scrolls, like the input of a chat app.
export function autosize(textarea, maxPx = 320) {
  const fit = () => {
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight + 2, maxPx)}px`
    textarea.style.overflowY = textarea.scrollHeight + 2 > maxPx ? 'auto' : 'hidden'
  }
  textarea.addEventListener('input', fit)
  textarea.style.resize = 'none'
  fit()
  return fit
}
