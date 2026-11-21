import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadConfig } from '../src/config.ts'
import { addMemory, openStore, reindex, search } from '../src/store.ts'
import { loadHfJsonTokenizer } from '../src/tokenizers/hf-json.ts'

const M = '\u2581'

function writeUnigramFixture(dir: string): string {
  const path = join(dir, 'unigram.tokenizer.json')
  const json = {
    version: '1.0',
    added_tokens: [{ id: 0, content: '<unk>', special: true }, { id: 1, content: '<s>', special: true }],
    normalizer: { type: 'Sequence', normalizers: [{ type: 'NFKC' }, { type: 'Lowercase' }] },
    pre_tokenizer: { type: 'Metaspace', replacement: M, add_prefix_space: true },
    model: {
      type: 'Unigram',
      unk_id: 0,
      vocab: [
        ['<unk>', 0],
        ['<s>', 0],
        [`${M}use`, -2.0], [`${M}sqlite`, -1.2], [`${M}wal`, -1.3], [`${M}mode`, -2.0],
        [`${M}for`, -2.0], [`${M}the`, -2.0], [`${M}hook`, -1.5], [`${M}writer`, -1.5],
        [`${M}데이터베이스`, -1.1], [`${M}백업`, -1.0], ['은', -2.5], [`${M}매일`, -2.0],
        [`${M}새벽`, -2.0], ['에', -2.5], [`${M}실행`, -1.5], ['한다', -2.5],
        [`${M}東京`, -1.0], ['の', -2.5], ['サーバー', -1.2], ['で', -2.5],
        ['デプロイ', -1.0], [`${M}デプロイ`, -1.0], ['が', -2.5], ['失敗', -1.5], ['した', -2.5],
        [`${M}向量`, -1.2], ['搜索', -1.2], ['需要', -2.0], ['分词', -1.0], [`${M}分词`, -1.0], ['器', -2.0],
      ],
    },
  }
  writeFileSync(path, JSON.stringify(json))
  return path
}

function writeBpeFixture(dir: string): string {
  const path = join(dir, 'bpe.tokenizer.json')
  const merges: [string, string][] = [
    [M, 's'], [`${M}s`, 'q'], [`${M}sq`, 'l'], [`${M}sql`, 'i'], [`${M}sqli`, 't'], [`${M}sqlit`, 'e'],
    [M, 'w'], [`${M}w`, 'a'], [`${M}wa`, 'l'],
    [M, '백'], [`${M}백`, '업'],
    ['デ', 'プ'], ['デプ', 'ロ'], ['デプロ', 'イ'], [M, 'デ'], [`${M}デ`, 'プ'], [`${M}デプ`, 'ロ'], [`${M}デプロ`, 'イ'],
    ['東', '京'], [M, '東'], [`${M}東`, '京'],
    ['分', '词'], [M, '分'], [`${M}分`, '词'],
  ]
  const vocab: Record<string, number> = { '<unk>': 0 }
  let id = 1
  for (const [a, b] of merges) {
    for (const piece of [a, b, a + b]) {
      if (!(piece in vocab)) vocab[piece] = id++
    }
  }
  const json = {
    version: '1.0',
    added_tokens: [{ id: 0, content: '<unk>', special: true }],
    normalizer: { type: 'Sequence', normalizers: [{ type: 'NFKC' }, { type: 'Lowercase' }] },
    pre_tokenizer: { type: 'Metaspace', replacement: M, prepend_scheme: 'always' },
    model: { type: 'BPE', vocab, merges },
  }
  writeFileSync(path, JSON.stringify(json))
  return path
}

function verifyMultilingualSearch(tokenizerPath: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'aimem-hf-'))
  const config = { ...loadConfig(dir, false), tokenizer: { type: 'hf-json' as const, path: tokenizerPath } }
  const s = openStore(config)
  try {
    const add = (content: string) => addMemory(s, { session_id: 's1', agent: 'claude', project: 'p', kind: 'note', content })
    add('Use SQLite WAL mode for the hook writer')
    add('데이터베이스 백업은 매일 새벽에 실행한다')
    add('東京のサーバーでデプロイが失敗した')
    add('向量搜索需要分词器')
    assert.equal(add('向量搜索需要分词器'), null)
    assert.match(search(s, 'sqlite wal')[0].content, /SQLite/)
    assert.match(search(s, '백업')[0].content, /백업/)
    assert.match(search(s, 'デプロイ')[0].content, /東京/)
    assert.match(search(s, '分词')[0].content, /分词器/)
  } finally {
    s.db.close()
  }
}

test('[critical] hf-json Unigram tokenizer passes 4-language hybrid search expectations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aimem-uni-'))
  verifyMultilingualSearch(writeUnigramFixture(dir))
})

test('[critical] hf-json BPE tokenizer passes 4-language hybrid search expectations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aimem-bpe-'))
  verifyMultilingualSearch(writeBpeFixture(dir))
})

test('switching from builtin to hf-json prints aimem reindex warning until reindexed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aimem-switch-'))
  const tokPath = writeUnigramFixture(dir)
  const initial = openStore(loadConfig(dir, false))
  addMemory(initial, { session_id: 's1', agent: 'claude', project: 'p', kind: 'note', content: '데이터베이스 백업은 매일 새벽에 실행한다' })
  initial.db.close()

  writeFileSync(join(dir, 'aimemory.config.json'), JSON.stringify({ tokenizer: { type: 'hf-json', path: tokPath } }))
  const before = spawnSync(process.execPath, ['src/cli.ts', 'recent'], { env: { ...process.env, AIMEMORY_HOME: dir }, encoding: 'utf8' })
  assert.equal(before.status, 0)
  assert.match(before.stderr, /aimem reindex/)

  const reindexed = openStore(loadConfig(dir))
  assert.equal(reindex(reindexed), 1)
  reindexed.db.close()

  const after = spawnSync(process.execPath, ['src/cli.ts', 'recent'], { env: { ...process.env, AIMEMORY_HOME: dir }, encoding: 'utf8' })
  assert.equal(after.status, 0)
  assert.doesNotMatch(after.stderr, /aimem reindex/)
})

test('loadHfJsonTokenizer rejects unsupported model types', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aimem-bad-tok-'))
  const bad = join(dir, 'wordpiece.json')
  writeFileSync(bad, JSON.stringify({ model: { type: 'WordPiece', vocab: {} } }))
  assert.throws(() => loadHfJsonTokenizer(bad), /unsupported HuggingFace tokenizer model type/)
})
