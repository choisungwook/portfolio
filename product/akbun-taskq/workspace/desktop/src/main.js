// Shown until taskq prints its address and the window moves there. If taskq ends first, its last lines are shown.
const { invoke } = window.__TAURI__.core
const timer = setInterval(async () => {
  const error = await invoke('startup_error')
  if (error === null) return
  clearInterval(timer)
  document.getElementById('status').textContent = 'taskq did not start.'
  const pre = document.getElementById('error')
  pre.textContent = error
  pre.hidden = false
}, 500)
