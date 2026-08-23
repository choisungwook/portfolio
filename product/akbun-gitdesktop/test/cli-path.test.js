const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

function loadCliModule() {
  return import('../src/main/cli.ts')
}

test('GUI PATH 밖의 Homebrew gh 경로도 검사한다', async () => {
  if (process.platform === 'win32') return

  const { commandPaths } = await loadCliModule()
  const paths = commandPaths('gh')

  assert.ok(paths.includes('/opt/homebrew/bin/gh'))
  assert.ok(paths.includes('/usr/local/bin/gh'))
})

test('찾은 절대 경로로 CLI를 실행한다', async () => {
  if (process.platform === 'win32') return

  const { runCli } = await loadCliModule()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akbun-gitdesktop-cli-'))
  const executable = path.join(dir, 'fake-gh')
  const previousPath = process.env.PATH
  fs.writeFileSync(executable, '#!/bin/sh\nprintf "found:%s" "$1"\n', { mode: 0o755 })
  process.env.PATH = dir

  try {
    const output = await runCli(undefined, 'fake-gh', ['ok'])
    assert.strictEqual(output, 'found:ok')
  } finally {
    process.env.PATH = previousPath
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
