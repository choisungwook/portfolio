import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadConfig } from '../src/config.ts'
import { builtinTokenize } from '../src/tokenizer.ts'
import { addMemory, dbPath, exportDb, importDb, openStore, search } from '../src/store.ts'
import { drainSpool, runHook, spoolPath } from '../src/hook.ts'

const home = () => loadConfig(mkdtempSync(join(tmpdir(), 'aimem-')))
const add = (s: ReturnType<typeof openStore>, content: string) => addMemory(s, { session_id: 's1', agent: 'claude', project: 'p', kind: 'note', content })

test('[critical] builtin tokenizer splits Korean, Japanese and Chinese without spaces', () => {
  assert.deepEqual(builtinTokenize('東京都'), ['東京', '京都'])
  assert.deepEqual(builtinTokenize('메모리를'), ['메모리를', '메모', '모리', '리를'])
  assert.deepEqual(builtinTokenize('SQLite Backup'), ['sqlite', 'backup'])
})

test('[critical] hybrid search finds the right memory in four languages and ignores duplicates', () => {
  const s = openStore(home())
  add(s, 'Use SQLite WAL mode for the hook writer')
  add(s, '데이터베이스 백업은 매일 새벽에 실행한다')
  add(s, '東京のサーバーでデプロイが失敗した')
  add(s, '向量搜索需要分词器')
  assert.equal(add(s, '向量搜索需要分词器'), null)
  assert.match(search(s, 'sqlite wal')[0].content, /SQLite/)
  assert.match(search(s, '백업')[0].content, /백업/)
  assert.match(search(s, 'デプロイ')[0].content, /東京/)
  assert.match(search(s, '分词')[0].content, /分词器/)
})

test('[critical] export then import into an empty store keeps every memory searchable', () => {
  const a = openStore(home())
  add(a, 'release notes need the xattr bypass')
  const file = join(mkdtempSync(join(tmpdir(), 'aimem-bk-')), 'b.db')
  exportDb(a, file)
  const b = openStore(home())
  assert.deepEqual(importDb(b, file), { added: 1, skipped: 0 })
  assert.deepEqual(importDb(b, file), { added: 0, skipped: 1 })
  assert.match(search(b, 'xattr')[0].content, /xattr/)
})

test('[critical] a broken database spools the hook event, and the next run replays it', () => {
  const config = home()
  const prompt = JSON.stringify({ session_id: 's9', cwd: '/x/proj', hook_event_name: 'UserPromptSubmit', prompt: 'remember the canary flag' })
  openStore(config).db.close()
  rmSync(dbPath(config)); rmSync(`${dbPath(config)}-wal`, { force: true }); rmSync(`${dbPath(config)}-shm`, { force: true })
  writeFileSync(dbPath(config), 'not a database')
  assert.equal(runHook(config, 'claude', prompt), '')
  assert.ok(existsSync(spoolPath(config)))
  rmSync(dbPath(config))
  runHook(config, 'claude', JSON.stringify({ session_id: 's9', hook_event_name: 'Stop' }))
  assert.equal(existsSync(spoolPath(config)), false)
  assert.match(search(openStore(config), 'canary')[0].content, /canary/)
})

test('[critical] the hook command exits 0 on garbage input, a broken config and unknown flags', () => {
  const dir = home().home
  const run = (input: string) => spawnSync(process.execPath, ['src/cli.ts', 'hook', '--agent', 'kiro', '--bogus'], { input, env: { ...process.env, AIMEMORY_HOME: dir } })
  assert.equal(run('{oops').status, 0)
  writeFileSync(join(dir, 'aimemory.config.json'), '{broken')
  assert.equal(run(JSON.stringify({ session_id: 'k', hook_event_name: 'userPromptSubmit', prompt: 'config broken' })).status, 0)
  assert.match(search(openStore(loadConfig(dir, false)), 'config broken')[0].content, /config broken/)
})

test('[critical] a replay that fails to store puts the line back in the spool', () => {
  const config = home()
  writeFileSync(spoolPath(config), JSON.stringify({ agent: 'claude', payload: { session_id: 'r', hook_event_name: 'UserPromptSubmit', prompt: 'keep me' }, at: 1 }) + '\n')
  const s = openStore(config)
  s.tokenizer.tokenize = () => { throw new Error('tokenizer down') }
  assert.equal(drainSpool(s), 0)
  assert.match(readFileSync(spoolPath(config), 'utf8'), /keep me/)
})
