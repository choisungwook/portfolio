import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { loadConfig } from '../src/config.ts'
import { contextText, runHook } from '../src/hook.ts'
import { indexSession } from '../src/indexer/index.ts'
import { callClaude, callOpenAI } from '../src/indexer/providers.ts'
import { addMemory, openStore, search, sessionMemories } from '../src/store.ts'

const home = (extra: Partial<ReturnType<typeof loadConfig>> = {}) => ({
  ...loadConfig(mkdtempSync(join(tmpdir(), 'aimem-idx-')), false),
  ...extra,
})

test('LLM indexer stores session summary and applies ADD, UPDATE, and NOOP without deleting raw observations', async () => {
  const s = openStore(home())
  try {
    const oldFactId = addMemory(s, { session_id: 's0', agent: 'claude', project: 'app', kind: 'note', content: 'Deploy region is us-east-1' })
    const otherProjId = addMemory(s, { session_id: 's-other', agent: 'claude', project: 'other', kind: 'note', content: 'Other project secret' })
    addMemory(s, { session_id: 's1', agent: 'claude', project: 'app', kind: 'prompt', content: 'Switch deployment region to ap-northeast-2 and enable WAL backup' })
    addMemory(s, { session_id: 's1', agent: 'claude', project: 'app', kind: 'response', content: 'Updated terraform to ap-northeast-2 and added daily WAL backup job.' })
    assert.ok(oldFactId !== null && otherProjId !== null)

    const result = await indexSession(s, 's1', {
      callModel: async (prompt, cfg) => {
        assert.equal(cfg.provider, 'claude')
        assert.equal(cfg.model, 'claude-haiku-5-5')
        assert.equal(cfg.effort, 'low')
        assert.match(prompt, /us-east-1/)
        return JSON.stringify({
          summary: 'Moved app deployment region to ap-northeast-2 and scheduled daily WAL backups.',
          actions: [
            { op: 'UPDATE', target_id: oldFactId, content: 'Deploy region is ap-northeast-2' },
            { op: 'UPDATE', target_id: otherProjId, content: 'Should be ignored because other project is out of scope' },
            { op: 'ADD', content: 'Daily SQLite WAL backups run via cron' },
            { op: 'NOOP', reason: 'already tracked' },
          ],
        })
      },
    })

    assert.ok(result.summaryId !== null)
    assert.equal(result.added, 1)
    assert.equal(result.updated, 1)
    assert.equal(result.noop, 1)

    // Raw observations are preserved, never deleted.
    const s1Rows = sessionMemories(s, 's1')
    assert.equal(s1Rows.filter((m) => m.kind === 'prompt' || m.kind === 'response').length, 2)
    assert.equal(s1Rows.filter((m) => m.kind === 'summary').length, 1)

    // Superseded memory is invalidated, not deleted; out-of-scope project memory stays valid.
    assert.equal(search(s, 'us-east-1', { project: 'app' }).length, 0)
    assert.equal(search(s, 'us-east-1', { project: 'app', includeInvalid: true }).length, 1)
    assert.match(search(s, 'ap-northeast-2', { project: 'app' })[0].content, /ap-northeast-2/)
    // Re-running without force skips even after ADD/UPDATE notes were inserted.
    let calls = 0
    const skipped = await indexSession(s, 's1', { callModel: async () => { calls++; return '{}' } })
    assert.equal(skipped.skipped, true)
    assert.equal(calls, 0)

    // Forced re-indexing with identical summary keeps the summary valid (no digest collision loss).
    const same = await indexSession(s, 's1', {
      force: true,
      callModel: async () => JSON.stringify({
        summary: 'Moved app deployment region to ap-northeast-2 and scheduled daily WAL backups.',
        actions: [],
      }),
    })
    assert.equal(same.summaryId, result.summaryId)
    assert.equal(sessionMemories(s, 's1').filter((m) => m.kind === 'summary' && m.valid_until === null).length, 1)
  } finally {
    s.db.close()
  }
})

test('provider: none and model failures leave raw observations intact and searchable', async () => {
  const sNone = openStore(home({ indexer: { provider: 'none', model: 'claude-haiku-5-5', effort: 'low' } }))
  try {
    addMemory(sNone, { session_id: 's1', agent: 'claude', project: 'p', kind: 'prompt', content: 'keep raw observation searchable' })
    const res = await indexSession(sNone, 's1', { callModel: async () => { throw new Error('must not be called') } })
    assert.equal(res.skipped, true)
    assert.match(search(sNone, 'raw observation')[0].content, /raw observation/)
  } finally {
    sNone.db.close()
  }

  const sErr = openStore(home())
  try {
    addMemory(sErr, { session_id: 's2', agent: 'claude', project: 'p', kind: 'prompt', content: 'fallback when model errors' })
    const res = await indexSession(sErr, 's2', { callModel: async () => { throw new Error('network timeout') } })
    assert.match(res.error ?? '', /network timeout/)
    assert.equal(res.summaryId, null)
    assert.match(search(sErr, 'fallback')[0].content, /fallback/)
  } finally {
    sErr.db.close()
  }
})

test('contextText outputs session summaries instead of raw observations for summarized sessions', async () => {
  const s = openStore(home())
  try {
    addMemory(s, { session_id: 's-sum', agent: 'claude', project: 'web', kind: 'prompt', content: 'RAW_PROMPT_NOISE_123' })
    addMemory(s, { session_id: 's-sum', agent: 'claude', project: 'web', kind: 'tool', content: 'RAW_TOOL_NOISE_456' })
    addMemory(s, { session_id: 's-raw', agent: 'claude', project: 'web', kind: 'prompt', content: 'UNSUMMARIZED_PROMPT_789' })
    await indexSession(s, 's-sum', {
      callModel: async () => JSON.stringify({ summary: 'CONCISE_SESSION_SUMMARY', actions: [] }),
    })

    const ctx = contextText(s, 'web')
    assert.match(ctx, /\[.* summary\] CONCISE_SESSION_SUMMARY/)
    assert.doesNotMatch(ctx, /RAW_PROMPT_NOISE_123/)
    assert.doesNotMatch(ctx, /RAW_TOOL_NOISE_456/)
    assert.match(ctx, /UNSUMMARIZED_PROMPT_789/)
  } finally {
    s.db.close()
  }
})

test('claude and openai providers parse structured JSON responses over HTTP', async () => {
  const received: { path: string; body: Record<string, unknown> }[] = []
  const stub = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      received.push({ path: req.url ?? '', body })
      res.writeHead(200, { 'content-type': 'application/json' })
      if (req.url === '/v1/messages') {
        res.end(JSON.stringify({ content: [{ type: 'text', text: '{"summary":"claude ok","actions":[]}' }] }))
      } else {
        res.end(JSON.stringify({ choices: [{ message: { content: '{"summary":"openai ok","actions":[]}' } }] }))
      }
    })
  })
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve))
  const addr = stub.address()
  const baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  const prev = {
    aKey: process.env.ANTHROPIC_API_KEY, aUrl: process.env.ANTHROPIC_BASE_URL,
    oKey: process.env.OPENAI_API_KEY, oUrl: process.env.OPENAI_BASE_URL,
  }
  process.env.ANTHROPIC_API_KEY = 'test-anthropic'
  process.env.ANTHROPIC_BASE_URL = baseUrl
  process.env.OPENAI_API_KEY = 'test-openai'
  process.env.OPENAI_BASE_URL = baseUrl
  try {
    const claudeOut = await callClaude('hello', { provider: 'claude', model: 'claude-haiku-5-5', effort: 'low' })
    assert.match(claudeOut, /claude ok/)
    const openaiOut = await callOpenAI('hello', { provider: 'openai', model: 'gpt-5-mini', effort: 'low' })
    assert.match(openaiOut, /openai ok/)
    assert.equal(received[0].body.model, 'claude-haiku-5-5')
    assert.equal(received[1].body.model, 'gpt-5-mini')
    assert.equal(received[1].body.reasoning_effort, 'low')
  } finally {
    await new Promise<void>((resolve) => stub.close(() => resolve()))
    if (prev.aKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prev.aKey
    if (prev.aUrl === undefined) delete process.env.ANTHROPIC_BASE_URL; else process.env.ANTHROPIC_BASE_URL = prev.aUrl
    if (prev.oKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prev.oKey
    if (prev.oUrl === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = prev.oUrl
  }
})

test('Stop hook spawns detached background indexer under 100ms without waiting for slow model', async () => {
  const stub = createServer((_req, res) => {
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ content: [{ type: 'text', text: '{"summary":"ASYNC_BACKGROUND_SUMMARY","actions":[]}' }] }))
    }, 250)
  })
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve))
  const addr = stub.address()
  const baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  const prev = { aKey: process.env.ANTHROPIC_API_KEY, aUrl: process.env.ANTHROPIC_BASE_URL }
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.ANTHROPIC_BASE_URL = baseUrl

  const cfg = home()
  try {
    const t0 = performance.now()
    const out = runHook(cfg, 'claude', JSON.stringify({
      session_id: 's-bg',
      cwd: '/tmp/proj',
      hook_event_name: 'Stop',
      last_assistant_message: 'Finished refactoring the cache layer.',
    }))
    const hookMs = performance.now() - t0
    assert.equal(out, '')
    assert.ok(hookMs < 100, `Stop hook took ${hookMs.toFixed(1)}ms, expected < 100ms`)

    // Wait for the detached background process to finish calling the slow stub and write the summary.
    let found = false
    for (let attempt = 0; attempt < 40; attempt++) {
      await delay(100)
      const check = openStore(cfg)
      const rows = sessionMemories(check, 's-bg')
      check.db.close()
      if (rows.some((m) => m.kind === 'summary' && m.content.includes('ASYNC_BACKGROUND_SUMMARY'))) {
        found = true
        break
      }
    }
    assert.equal(found, true, 'detached background indexer wrote kind=summary asynchronously')
  } finally {
    await new Promise<void>((resolve) => stub.close(() => resolve()))
    if (prev.aKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prev.aKey
    if (prev.aUrl === undefined) delete process.env.ANTHROPIC_BASE_URL; else process.env.ANTHROPIC_BASE_URL = prev.aUrl
  }
})
