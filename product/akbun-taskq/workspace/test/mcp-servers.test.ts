import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Options, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { createApp } from '../src/api/server.ts'
import { createClaudeTeamBackend, type TeamQueryFn } from '../src/agents/claude/team.ts'
import { createOpenAITeamBackend, type OpenAIRunArgs } from '../src/agents/openai/team.ts'
import { getAgent } from '../src/db/team.ts'
import { createTeamHub, type TeamHub } from '../src/team/hub.ts'
import type { TeamBackend, TurnRequest } from '../src/team/types.ts'
import { postMessage, USER } from '../src/db/team.ts'
import { teamChanged } from '../src/wake.ts'
import { seedTestBots, setup, waitFor, TOKEN, type TestEnv } from './helpers.ts'

// The Plugins menu's Claude and OpenAI sides: MCP servers both SDKs start for the bots that pick them, and skills that
// OpenAI bots read with read_skill.

describe('MCP servers and skills across SDKs', () => {
  let env: TestEnv
  let hub: TeamHub | undefined
  test.beforeEach(async () => {
    env = setup()
    await seedTestBots(env.db)
  })
  test.afterEach(async () => {
    await hub?.stop()
    hub = undefined
    env.cleanup()
  })

  const headers = { 'x-taskq-token': TOKEN, 'content-type': 'application/json' }
  const call = (method: string, path: string, body?: unknown) =>
    createApp({ db: env.db, config: env.config }, TOKEN).request(`/api${path}`, {
      method, headers: { ...headers, host: `127.0.0.1:${env.config.port}` }, body: body === undefined ? undefined : JSON.stringify(body),
    })

  test('[critical] a registered MCP server reaches the turn of a bot that picked it, and leaves every bot when removed', async () => {
    assert.equal((await call('POST', '/bot-mcp-servers', { name: 'github', command: 'npx', args: ['-y', 'server-github'], description: 'issues' })).status, 201)
    assert.equal((await call('POST', '/bot-mcp-servers', { name: 'team', command: 'x' })).status, 400, 'team is reserved')
    assert.equal((await call('PUT', '/bots/coder', { mcp_servers: ['github'] })).status, 200)
    assert.equal((await call('PUT', '/bots/coder', { mcp_servers: ['nope'] })).status, 400)
    assert.deepEqual(getAgent(env.db, 'coder')?.mcp_servers, ['github'])
    const seen: TurnRequest[] = []
    const backend: TeamBackend = { async runTurn(_c, r) { seen.push(r); return { outcome: 'done', cost_usd: 0 } } }
    hub = createTeamHub({ db: env.db, config: env.config, backend, retryAfterSec: 0 })
    await hub.start()
    postMessage(env.db, { sender: USER, recipient: 'coder', body: 'hi' })
    teamChanged.notify()
    await waitFor(() => seen.length === 1)
    assert.deepEqual(seen[0].mcpServers, [{ name: 'github', command: 'npx', args: ['-y', 'server-github'], description: 'issues' }])
    assert.equal((await call('DELETE', '/bot-mcp-servers/github')).status, 204)
    assert.deepEqual(getAgent(env.db, 'coder')?.mcp_servers, [])
  })

  test('the Claude session gets the MCP server over stdio next to the team server', async () => {
    const calls: Options[] = []
    const query: TeamQueryFn = ({ prompt, options }) => {
      calls.push(options)
      return (async function* () {
        await (prompt as AsyncIterable<SDKUserMessage>)[Symbol.asyncIterator]().next()
        yield { type: 'result', subtype: 'success', session_id: 's', num_turns: 1, total_cost_usd: 0, errors: [] } as unknown as SDKMessage
      })()
    }
    const cwd = join(env.home, 'team', 'coder')
    mkdirSync(cwd, { recursive: true })
    await createClaudeTeamBackend(query).runTurn(env.config, {
      agent: getAgent(env.db, 'coder')!, system: '', prompt: 'x', tools: [], cwd, plugins: [], sharedDir: join(env.home, 'shared'),
      maxTurns: 5, resume: null, signal: new AbortController().signal,
      mcpServers: [{ name: 'github', command: 'npx', args: ['-y', 'server-github'], description: '' }],
    })
    const servers = calls[0].mcpServers as Record<string, { type: string; command?: string; args?: string[] }>
    assert.deepEqual(Object.keys(servers).sort(), ['github', 'team'])
    assert.deepEqual(servers.github, { type: 'stdio', command: 'npx', args: ['-y', 'server-github'] })
  })

  test('[critical] an OpenAI bot reads its skills with read_skill and gets its MCP servers', async () => {
    const skill = join(env.home, 'skills-copy', 'release-notes')
    mkdirSync(skill, { recursive: true })
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: release-notes\n---\nWrite notes for AI readers.')
    writeFileSync(join(skill, 'template.md'), '# Notes')
    const cwd = join(env.home, 'team', 'coder')
    mkdirSync(cwd, { recursive: true })
    let args: OpenAIRunArgs | undefined
    let text = ''
    await createOpenAITeamBackend(async (a) => {
      args = a
      text = await a.tools.find((t) => t.name === 'read_skill')!.run({ name: 'release-notes' })
      return { inputTokens: 0, outputTokens: 0, requests: 1 }
    }).runTurn(env.config, {
      agent: { ...getAgent(env.db, 'coder')!, sdk: 'openai', permission_mode: 'plan' }, system: '', prompt: 'x', tools: [], cwd, plugins: [],
      sharedDir: join(env.home, 'shared'), maxTurns: 5, resume: null, signal: new AbortController().signal,
      skills: [{ name: 'release-notes', description: 'notes for AI', path: skill }],
      mcpServers: [{ name: 'github', command: 'npx', args: [], description: '' }],
    })
    assert.match(text, /Write notes for AI readers/)
    assert.match(text, /template\.md/)
    assert.deepEqual(args?.mcpServers.map((s) => s.name), ['github'])
    assert.match(args!.tools.find((t) => t.name === 'read_skill')!.description, /release-notes \(notes for AI\)/)
  })
})
