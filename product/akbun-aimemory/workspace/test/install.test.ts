import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadConfig } from '../src/config.ts'
import { runHook, toMemory, type HookPayload } from '../src/hook.ts'
import { installAgent, SUPPORTED_AGENTS } from '../src/install/index.ts'
import { openStore, search, sessionMemories } from '../src/store.ts'

const fixture = (name: string): HookPayload[] =>
  JSON.parse(readFileSync(new URL(`./fixtures/hooks/${name}.json`, import.meta.url), 'utf8')) as HookPayload[]

test('installAgent installs hooks and SKILL.md idempotently for all four agents while preserving existing config', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'aimem-install-home-'))

  // Seed pre-existing settings and hooks for every agent to ensure nothing is overwritten.
  mkdirSync(join(fakeHome, '.claude'), { recursive: true })
  writeFileSync(join(fakeHome, '.claude', 'settings.json'), JSON.stringify({
    model: 'claude-sonnet-5-5',
    hooks: { PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo keep-me' }] }] },
  }))
  mkdirSync(join(fakeHome, '.codex'), { recursive: true })
  writeFileSync(join(fakeHome, '.codex', 'hooks.json'), JSON.stringify({
    hooks: { SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: 'echo codex-keep' }] }] },
  }))
  mkdirSync(join(fakeHome, '.kiro', 'agents'), { recursive: true })
  writeFileSync(join(fakeHome, '.kiro', 'agents', 'default.json'), JSON.stringify({
    name: 'default',
    tools: ['read', 'write'],
    hooks: { stop: [{ command: 'echo kiro-keep' }] },
  }))
  mkdirSync(join(fakeHome, '.gemini', 'config'), { recursive: true })
  writeFileSync(join(fakeHome, '.gemini', 'config', 'hooks.json'), JSON.stringify({
    'lint-checker': { Stop: [{ type: 'command', command: 'echo agy-keep' }] },
  }))

  for (const agent of SUPPORTED_AGENTS) {
    const first = installAgent(agent, { homeDir: fakeHome })
    assert.ok(first.hooksAdded >= 4, `${agent} added hooks`)
    assert.equal(first.skillInstalled, true)
    assert.equal(existsSync(first.skillPath), true)
    assert.match(readFileSync(first.skillPath, 'utf8'), /name: aimemory/)

    const beforeSecond = readFileSync(first.hookConfigPath, 'utf8')
    const second = installAgent(agent, { homeDir: fakeHome })
    assert.equal(second.hooksAdded, 0, `${agent} second install adds no duplicate hooks`)
    assert.equal(readFileSync(second.hookConfigPath, 'utf8'), beforeSecond)
  }

  // Verify existing user settings and unrelated hooks were preserved.
  const claudeDoc = JSON.parse(readFileSync(join(fakeHome, '.claude', 'settings.json'), 'utf8')) as Record<string, unknown>
  assert.equal(claudeDoc.model, 'claude-sonnet-5-5')
  assert.match(JSON.stringify(claudeDoc.hooks), /echo keep-me/)

  const codexDoc = JSON.parse(readFileSync(join(fakeHome, '.codex', 'hooks.json'), 'utf8')) as Record<string, unknown>
  assert.match(JSON.stringify(codexDoc.hooks), /echo codex-keep/)

  const kiroDoc = JSON.parse(readFileSync(join(fakeHome, '.kiro', 'agents', 'default.json'), 'utf8')) as Record<string, unknown>
  assert.equal(kiroDoc.name, 'default')
  assert.match(JSON.stringify(kiroDoc.hooks), /echo kiro-keep/)

  const agyDoc = JSON.parse(readFileSync(join(fakeHome, '.gemini', 'config', 'hooks.json'), 'utf8')) as Record<string, unknown>
  assert.ok('lint-checker' in agyDoc)
  assert.ok('aimemory' in agyDoc)
})

test('CLI aimem install --agent claude --json works with HOME override', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'aimem-cli-install-'))
  const run = spawnSync(process.execPath, ['src/cli.ts', 'install', '--agent', 'claude', '--json'], {
    env: { ...process.env, HOME: fakeHome, AIMEMORY_HOME: join(fakeHome, '.aimemory') },
    encoding: 'utf8',
  })
  assert.equal(run.status, 0)
  const out = JSON.parse(run.stdout) as { agent: string; hooksAdded: number; skillPath: string }
  assert.equal(out.agent, 'claude')
  assert.equal(out.hooksAdded, 5)
  assert.equal(existsSync(out.skillPath), true)
})

test('real Codex, Kiro, and Antigravity hook payload fixtures parse cleanly and store memories', () => {
  const cfg = { ...loadConfig(mkdtempSync(join(tmpdir(), 'aimem-fixtures-')), false), indexer: { provider: 'none' as const, model: 'claude-haiku-5-5', effort: 'low' as const } }

  // Codex fixture
  const codexPayloads = fixture('codex')
  for (const p of codexPayloads) runHook(cfg, 'codex', JSON.stringify(p))
  const s1 = openStore(cfg)
  try {
    const codexRows = sessionMemories(s1, 'codex-thread-001')
    assert.equal(codexRows.length, 3, 'prompt + tool + stop response stored for codex')
    assert.match(search(s1, 'idempotency key', { project: 'payments' })[0].content, /idempotency/)
  } finally { s1.db.close() }

  // Kiro fixture
  const kiroPayloads = fixture('kiro')
  for (const p of kiroPayloads) runHook(cfg, 'kiro', JSON.stringify(p))
  const s2 = openStore(cfg)
  try {
    const kiroRows = sessionMemories(s2, 'kiro-sess-77')
    assert.equal(kiroRows.length, 2, 'prompt + postToolUse stored for kiro')
    assert.match(search(s2, 'VPC flow logs', { project: 'infra' })[0].content, /VPC flow logs/)
    assert.match(kiroRows[1].content, /File successfully written/)
  } finally { s2.db.close() }

  // Antigravity fixture (camelCase fields + JSON stdout contract)
  const agyPayloads = fixture('antigravity')
  assert.equal(toMemory('antigravity', agyPayloads[1])?.kind, 'prompt')
  assert.equal(toMemory('antigravity', agyPayloads[2])?.kind, 'tool')
  const firstStart = runHook(cfg, 'antigravity', JSON.stringify(agyPayloads[0]))
  assert.deepEqual(JSON.parse(firstStart), {})
  const preOut = runHook(cfg, 'antigravity', JSON.stringify(agyPayloads[1]))
  assert.deepEqual(JSON.parse(preOut), {})
  const postOut = runHook(cfg, 'antigravity', JSON.stringify(agyPayloads[2]))
  assert.deepEqual(JSON.parse(postOut), {})
  const stopOut = runHook(cfg, 'antigravity', JSON.stringify(agyPayloads[3]))
  assert.deepEqual(JSON.parse(stopOut), {})

  // Next SessionStart returns Antigravity injectSteps JSON with earlier search-engine memories.
  const nextStart = JSON.parse(runHook(cfg, 'antigravity', JSON.stringify(agyPayloads[0]))) as {
    injectSteps?: { systemMessage?: { systemMessage?: string } }[]
  }
  assert.ok(Array.isArray(nextStart.injectSteps) && nextStart.injectSteps.length === 1)
  assert.match(nextStart.injectSteps[0].systemMessage?.systemMessage ?? '', /sqlite-vec recall/)
})
