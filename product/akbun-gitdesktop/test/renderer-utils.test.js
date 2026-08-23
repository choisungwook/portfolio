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

test('브랜치 선택은 단일, 토글, 범위 선택을 구분한다', async () => {
  const { selectBranchNames } = await import('../src/renderer/src/lib/branchSelection.ts')
  const branches = ['main', 'feature-a', 'feature-b', 'feature-c']

  assert.deepStrictEqual(selectBranchNames(branches, ['main'], 'main', 'feature-a', 'single'), ['feature-a'])
  assert.deepStrictEqual(selectBranchNames(branches, ['main'], 'main', 'feature-b', 'toggle'), [
    'main',
    'feature-b'
  ])
  assert.deepStrictEqual(selectBranchNames(branches, ['main', 'feature-b'], 'main', 'main', 'toggle'), [
    'feature-b'
  ])
  assert.deepStrictEqual(selectBranchNames(branches, ['feature-c'], 'feature-a', 'feature-c', 'range'), [
    'feature-a',
    'feature-b',
    'feature-c'
  ])
  assert.deepStrictEqual(selectBranchNames(branches, ['main'], 'feature-a', 'feature-c', 'add-range'), [
    'main',
    'feature-a',
    'feature-b',
    'feature-c'
  ])
})

test('다른 그룹의 기준점으로 범위 선택하면 클릭한 브랜치만 선택한다', async () => {
  const { selectBranchNames } = await import('../src/renderer/src/lib/branchSelection.ts')

  assert.deepStrictEqual(
    selectBranchNames(['origin/main', 'origin/dev'], ['main'], '', 'origin/dev', 'range'),
    ['origin/dev']
  )
})
