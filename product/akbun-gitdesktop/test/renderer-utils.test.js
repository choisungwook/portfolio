const test = require('node:test')
const assert = require('node:assert')

test('formatBytes는 읽기 쉬운 이진 단위로 표시한다', async () => {
  const { formatBytes } = await import('../src/renderer/src/lib/formatBytes.ts')

  assert.strictEqual(formatBytes(0), '0 B')
  assert.strictEqual(formatBytes(1024), '1 KB')
  assert.strictEqual(formatBytes(1536), '1.5 KB')
  assert.strictEqual(formatBytes(25 * 1024 * 1024), '25 MB')
})

test('clampPanelWidth는 패널 너비를 허용 범위에 둔다', async () => {
  const { clampPanelWidth } = await import('../src/renderer/src/lib/usePanelWidth.ts')

  assert.strictEqual(clampPanelWidth(100, 160, 420), 160)
  assert.strictEqual(clampPanelWidth(240, 160, 420), 240)
  assert.strictEqual(clampPanelWidth(600, 160, 420), 420)
})
