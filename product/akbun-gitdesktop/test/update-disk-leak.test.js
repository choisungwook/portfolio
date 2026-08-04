/**
 * 업데이트 기능이 임시 파일을 남기지 않는지 검증한다.
 *
 * 업데이트는 용량이 큰 dmg를 임시 디렉터리에 받는다. 정리가 한 군데라도
 * 빠지면 실패할 때마다 디스크가 찬다. 정리 지점이 세 곳(교체 스크립트의 trap,
 * 스크립트 실행 전 실패, 다음 실행 때 남은 디렉터리 청소)이라 손으로 확인하기
 * 어려우므로, 업데이트 관련 코드를 고치면 이 테스트로 확인한다.
 *
 * 실행: npm test
 *
 * src/main/update.ts를 그대로 읽는다. node가 타입만 벗겨 내고 실행하므로
 * 빌드 산출물이 필요 없다. update.ts가 electron을 import하지 않는 이유다.
 *
 * 교체 스크립트 테스트는 hdiutil이 없는 환경에서도 돈다. attach 단계에서
 * 실패하는 것이 바로 검증 대상인 실패 경로이기 때문이다.
 */

const test = require('node:test')
const assert = require('node:assert')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const UPDATE_SOURCE = path.join(__dirname, '../src/main/update.ts')
const MAIN_SOURCE = path.join(__dirname, '../src/main/index.ts')
const TEMP_PREFIX = 'akbun-gitdesktop-update-'

/** os.tmpdir()에 남아 있는 업데이트 임시 디렉터리 수. */
function countTempDirs() {
  return fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(TEMP_PREFIX)).length
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX))
}

function loadUpdateModule() {
  return import('../src/main/update.ts')
}

test('cleanupTempDirs는 남은 업데이트 임시 디렉터리만 지운다', async () => {
  const { cleanupTempDirs } = await loadUpdateModule()
  const stale = makeTempDir()
  fs.writeFileSync(path.join(stale, 'leftover.dmg'), 'x'.repeat(1024))
  const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), 'unrelated-'))

  try {
    assert.ok(countTempDirs() > 0, '테스트가 만든 디렉터리가 보여야 한다')
    await cleanupTempDirs()

    assert.strictEqual(countTempDirs(), 0, '업데이트 임시 디렉터리가 남았다')
    assert.ok(fs.existsSync(unrelated), '무관한 디렉터리를 지우면 안 된다')
  } finally {
    fs.rmSync(unrelated, { recursive: true, force: true })
  }
})

test('downloadDmg는 내려받기에 실패하면 만든 디렉터리를 지운다', async () => {
  const { cleanupTempDirs, downloadDmg } = await loadUpdateModule()
  await cleanupTempDirs()

  // 연결이 거부되는 주소라 네트워크 없이도 즉시 실패한다.
  await assert.rejects(() => downloadDmg('http://127.0.0.1:1/akbun-gitdesktop.dmg'))

  assert.strictEqual(countTempDirs(), 0, '실패한 내려받기의 디렉터리가 남았다')
})

test('교체 스크립트는 실패해도 작업 디렉터리를 남기지 않는다', async () => {
  const { SWAP_SCRIPT } = await loadUpdateModule()
  const work = makeTempDir()
  const scriptPath = path.join(work, 'swap.sh')
  const dmgPath = path.join(work, 'fake.dmg')
  fs.writeFileSync(scriptPath, SWAP_SCRIPT, { mode: 0o755 })
  fs.writeFileSync(dmgPath, 'dmg 형식이 아니라 attach가 실패한다')

  // 이미 끝난 프로세스의 pid를 주어 종료 대기 루프를 즉시 빠져나가게 한다.
  const deadPid = spawnSync('/usr/bin/true').pid
  const appPath = path.join(work, 'nonexistent.app')

  const result = spawnSync('/bin/bash', [scriptPath, appPath, dmgPath, String(deadPid)], {
    stdio: 'ignore',
    timeout: 30_000
  })

  assert.notStrictEqual(result.status, 0, '잘못된 dmg인데 성공으로 끝났다')
  assert.ok(!fs.existsSync(work), '실패한 교체의 작업 디렉터리가 남았다')
})

test('정리 지점이 세 곳 모두 코드에 남아 있다', async () => {
  const { SWAP_SCRIPT } = await loadUpdateModule()
  const source = fs.readFileSync(UPDATE_SOURCE, 'utf-8')
  const mainSource = fs.readFileSync(MAIN_SOURCE, 'utf-8')

  assert.match(SWAP_SCRIPT, /trap cleanup EXIT/, '교체 스크립트의 trap이 사라졌다')
  assert.match(source, /cleanupTempDirs/, '남은 디렉터리 청소 함수가 사라졌다')
  assert.match(mainSource, /cleanupTempDirs/, '앱 시작 때 청소를 부르지 않는다')
  assert.match(mainSource, /fsp\.rm\(/, '설치 실패 시 dmg를 지우지 않는다')
})

test('tag 접두사와 임시 디렉터리 접두사가 이 제품의 것이다', () => {
  const source = fs.readFileSync(UPDATE_SOURCE, 'utf-8')

  // release workflow가 만드는 tag 형식과 어긋나면 업데이트가 영원히 안 뜬다.
  assert.match(source, /TAG_PREFIX = 'gitdesktop-v'/, 'tag 접두사가 릴리스와 어긋난다')
  assert.match(source, new RegExp(`TEMP_PREFIX = '${TEMP_PREFIX}'`), '임시 디렉터리 접두사가 바뀌었다')
})
