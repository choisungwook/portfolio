const test = require('node:test')
const assert = require('node:assert')

test('안전 삭제는 성공, 미병합, 일반 실패를 분리한다', async () => {
  const { deleteBranchBatch } = await import('../src/main/branchDeletion.ts')
  const merged = new Set(['merged', 'locked'])
  const deleteBranch = async (name, force) => {
    assert.strictEqual(force, false)
    if (name === 'merged') return
    throw new Error(name === 'locked' ? 'checked out in a worktree' : 'not fully merged')
  }

  const result = await deleteBranchBatch(
    ['merged', 'unmerged', 'locked'],
    false,
    deleteBranch,
    async (name) => merged.has(name)
  )

  assert.deepStrictEqual(result, {
    deleted: ['merged'],
    unmerged: ['unmerged'],
    failed: [{ name: 'locked', error: 'checked out in a worktree' }]
  })
})

test('강제 삭제 실패는 미병합 후보가 아니라 실패로 남긴다', async () => {
  const { deleteBranchBatch } = await import('../src/main/branchDeletion.ts')
  let mergeCheckCalled = false

  const result = await deleteBranchBatch(
    ['feature'],
    true,
    async () => { throw new Error('checked out in a worktree') },
    async () => {
      mergeCheckCalled = true
      return false
    }
  )

  assert.strictEqual(mergeCheckCalled, false)
  assert.deepStrictEqual(result, {
    deleted: [],
    unmerged: [],
    failed: [{ name: 'feature', error: 'checked out in a worktree' }]
  })
})
