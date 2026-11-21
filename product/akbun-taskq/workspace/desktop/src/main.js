// Shown until taskq prints its address and the window moves there. While it starts, a bar shows the percent and the
// step taskq printed (`taskq starting <percent> <step>`). If taskq ends first, its last lines are shown as a log the
// user can copy.
const { invoke } = window.__TAURI__.core
const ko = (navigator.language || '').toLowerCase().startsWith('ko')
const text = ko
  ? { status: 'taskq를 시작하는 중…', failed: 'taskq를 시작하지 못했습니다.', hint: '아래 로그는 taskq가 마지막으로 출력한 내용입니다. 복사해서 원인을 찾거나 문의할 때 붙여 넣으세요.', copy: '로그 복사', copied: '복사했습니다', blocked: '복사하지 못했습니다. 로그를 선택해 직접 복사하세요.' }
  : { status: 'Starting taskq…', failed: 'taskq did not start.', hint: 'The log below is what taskq printed last. Copy it to look for the cause or to report it.', copy: 'Copy log', copied: 'Copied', blocked: 'Could not copy. Select the log and copy it by hand.' }
const $ = (id) => document.getElementById(id)
$('status').textContent = text.status
$('failed-title').textContent = text.failed
$('failed-hint').textContent = text.hint
$('copy').textContent = text.copy

const timer = setInterval(async () => {
  const [percent, step] = await invoke('startup_progress')
  $('fill').style.width = `${percent}%`
  document.querySelector('.bar').setAttribute('aria-valuenow', String(percent))
  $('percent').textContent = `${percent}%`
  $('what').textContent = step
  const error = await invoke('startup_error')
  if (error === null) return
  clearInterval(timer)
  $('starting').hidden = true
  $('failed').hidden = false
  $('log').textContent = error
}, 300)

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('log').textContent)
    $('copy').textContent = text.copied
  } catch {
    // Without clipboard access, select the log so Cmd+C copies it.
    const range = document.createRange()
    range.selectNodeContents($('log'))
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    $('copy').textContent = text.blocked
  }
  setTimeout(() => { $('copy').textContent = text.copy }, 2500)
})
