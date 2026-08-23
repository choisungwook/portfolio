const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

test('directorySize는 하위 디렉터리의 파일 크기를 합산한다', async () => {
  const { directorySize } = await import('../src/main/directorySize.ts')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'akbun-gitdesktop-size-'))
  const nested = path.join(root, 'objects', 'pack')
  fs.mkdirSync(nested, { recursive: true })
  fs.writeFileSync(path.join(root, 'HEAD'), 'abc')
  fs.writeFileSync(path.join(nested, 'pack-file'), '12345')

  try {
    assert.strictEqual(await directorySize(root), 8)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
