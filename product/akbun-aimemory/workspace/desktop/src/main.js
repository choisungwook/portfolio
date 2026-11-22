// Shown until `aimem serve` prints its loopback address and the window navigates there.
// If `aimem` exits before becoming ready, its last lines are displayed for the user to copy.
const { invoke } = window.__TAURI__.core
const ko = (navigator.language || '').toLowerCase().startsWith('ko')
const text = ko
  ? { status: 'aimemory를 시작하는 중…', failed: 'aimemory를 시작하지 못했습니다.', hint: '아래 로그는 aimem이 마지막으로 출력한 내용입니다. 복사해서 원인을 확인하세요.', copy: '로그 복사', copied: '복사했습니다', blocked: '복사하지 못했습니다. 로그를 선택해 직접 복사하세요.' }
  : { status: 'Starting aimemory…', failed: 'aimemory did not start.', hint: 'The log below is what aimem printed last. Copy it to inspect the cause.', copy: 'Copy log', copied: 'Copied', blocked: 'Could not copy. Select the log and copy it by hand.' }
const $ = (id) => document.getElementById(id)
$('status').textContent = text.status
$('failed-title').textContent = text.failed
$('failed-hint').textContent = text.hint
$('copy').textContent = text.copy

const timer = setInterval(async () => {
  const error = await invoke('startup_error')
  if (error === null) return
  clearInterval(timer)
  $('starting').hidden = true
  $('failed').hidden = false
  $('log').textContent = error
}, 250)

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('log').textContent)
    $('copy').textContent = text.copied
  } catch {
    const range = document.createRange()
    range.selectNodeContents($('log'))
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    $('copy').textContent = text.blocked
  }
  setTimeout(() => { $('copy').textContent = text.copy }, 2500)
})
