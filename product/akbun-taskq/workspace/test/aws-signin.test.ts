import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { listProfiles } from '../src/aws/profiles.ts'
import { applyConnectionSettings, saveConnectionSettings } from '../src/team/connection-settings.ts'
import { createOpenAITeamBackend, type OpenAIRunFn } from '../src/agents/openai/team.ts'
import { clearConnectionCache, listConnections, type Checks } from '../src/team/connections.ts'
import { resolveConfig } from '../src/config.ts'
import { getAgent } from '../src/db/team.ts'
import { createApp } from '../src/api/server.ts'
import type { TurnRequest } from '../src/team/types.ts'
import { seedTestBots, setup, TOKEN, type TestEnv } from './helpers.ts'

// Claude and OpenAI-on-Bedrock bots signing in with a local AWS profile (SSO included). No AWS call runs here.

describe('AWS profile sign-in', () => {
  let env: TestEnv
  let aws: NodeJS.ProcessEnv
  test.beforeEach(async () => {
    clearConnectionCache()
    env = setup()
    await seedTestBots(env.db)
    const dir = join(env.home, 'aws')
    mkdirSync(dir)
    writeFileSync(join(dir, 'config'), [
      '[default]', 'region = us-east-1', '',
      '[profile example-sso]', 'sso_session = example', 'sso_account_id = 111122223333', 'sso_role_name = Reader', 'region = us-west-2', '',
      '[profile assume]', 'role_arn = arn:aws:iam::111122223333:role/x', 'source_profile = default', '',
      '[sso-session example]', 'sso_start_url = https://example.awsapps.com/start', 'sso_region = us-east-1', '',
      '[profile bad name!]', 'region = us-east-1',
    ].join('\n'))
    writeFileSync(join(dir, 'credentials'), ['[keys-only]', 'aws_access_key_id = AKIAEXAMPLE', 'aws_secret_access_key = secret'].join('\n'))
    aws = { AWS_CONFIG_FILE: join(dir, 'config'), AWS_SHARED_CREDENTIALS_FILE: join(dir, 'credentials') }
  })
  test.afterEach(() => env.cleanup())

  test('local profiles are listed with how each signs in, never with keys', () => {
    const profiles = listProfiles(aws)
    assert.deepEqual(profiles.map((p) => [p.name, p.kind, p.region]), [
      ['assume', 'role', null], ['default', 'other', 'us-east-1'], ['example-sso', 'sso', 'us-west-2'], ['keys-only', 'keys', null],
    ])
    assert.ok(!JSON.stringify(profiles).includes('secret') && !JSON.stringify(profiles).includes('AKIA'))
  })

  test('[critical] saved sign-in overrides the config file, applies at once and survives a restart', () => {
    assert.match(String(saveConnectionSettings(env.db, env.config, { claude_region: 'nowhere' })), /looks like us-east-1/)
    assert.match(String(saveConnectionSettings(env.db, env.config, { bedrock_profile: 'bad name!' })), /not a valid AWS profile/)
    const saved = saveConnectionSettings(env.db, env.config, { claude_provider: 'bedrock', claude_profile: 'example-sso', claude_region: 'us-west-2', bedrock_profile: 'example-sso', bedrock_region: 'us-east-1' })
    assert.equal(typeof saved, 'object')
    assert.deepEqual([env.config.provider, env.config.inferenceProfile, env.config.awsRegion, env.config.bots.bedrockProfile, env.config.bots.bedrockRegion],
      ['bedrock', 'example-sso', 'us-west-2', 'example-sso', 'us-east-1'])
    const restarted = resolveConfig(env.home, { provider: 'api_key' })
    applyConnectionSettings(env.db, restarted)
    assert.deepEqual([restarted.provider, restarted.inferenceProfile, restarted.bots.bedrockProfile], ['bedrock', 'example-sso', 'example-sso'])
  })

  test('[critical] an OpenAI bot on Bedrock signs a token from the chosen profile; an expired session is reported, not hidden', async () => {
    const agent = { ...getAgent(env.db, 'coder')!, sdk: 'openai' as const, provider: 'bedrock' as const }
    const request: TurnRequest = {
      agent, system: 'orders', prompt: 'hi', cwd: env.home, plugins: [], sharedDir: env.home, maxTurns: 5, budgetUsd: 1, tools: [],
      resume: null, signal: new AbortController().signal,
    }
    env.config.bots.bedrockProfile = 'example-sso'
    env.config.bots.bedrockRegion = 'us-east-1'
    const asked: string[] = []
    const run: OpenAIRunFn = async () => ({ inputTokens: 1, outputTokens: 1, requests: 1, history: [] })
    const ok = await createOpenAITeamBackend(run, fetch, undefined, async (profile, region) => {
      asked.push(`${profile}@${region}`)
      return 'bedrock-api-key-token'
    }).runTurn(env.config, request)
    assert.equal(ok.outcome, 'done')
    assert.deepEqual(asked, ['example-sso@us-east-1'])
    const expired = await createOpenAITeamBackend(run, fetch, undefined, async () => {
      throw new Error('The SSO session associated with this profile has expired')
    }).runTurn(env.config, request)
    assert.match(expired.error ?? '', /the AWS profile example-sso gave no credentials.*aws sso login --profile example-sso/)
    assert.equal(expired.auth_failed, undefined, 'the bot stays on; the user signs in by hand and it works again')
  })

  test('the Bedrock connection checks the profile; the API serves settings and profiles', async () => {
    env.config.bots.bedrockProfile = 'example-sso'
    const checks: Checks = {
      async claude() { return { status: 'ok', reason: null } },
      async codex() { return { status: 'ok', reason: null } },
      async kiro() { return { status: 'ok', reason: null } },
      async bedrockToken() { throw new Error('expired') },
      env: {},
    }
    const bedrock = (await listConnections(env.db, env.config, { checks })).connections.find((c) => c.id === 'openai:bedrock')!
    assert.equal(bedrock.detail, 'AWS profile example-sso, region us-west-2')
    assert.match(bedrock.reason ?? '', /aws sso login --profile example-sso/)

    const saved = { ...process.env }
    Object.assign(process.env, aws)
    try {
      const app = createApp({ db: env.db, config: env.config }, TOKEN)
      const headers = { 'x-taskq-token': TOKEN, 'content-type': 'application/json', host: `127.0.0.1:${env.config.port}` }
      const profiles = (await (await app.request('/api/aws/profiles', { headers })).json()) as { name: string }[]
      assert.ok(profiles.some((p) => p.name === 'example-sso'))
      const put = await app.request('/api/connection-settings', { method: 'PUT', headers, body: JSON.stringify({ bedrock_profile: '' }) })
      assert.equal(put.status, 200)
      assert.equal(env.config.bots.bedrockProfile, '', 'empty goes back to AWS_BEARER_TOKEN_BEDROCK')
      const bad = await app.request('/api/connection-settings', { method: 'PUT', headers, body: JSON.stringify({ claude_provider: 'vertex' }) })
      assert.equal(bad.status, 400)
    } finally {
      process.env.AWS_CONFIG_FILE = saved.AWS_CONFIG_FILE
      process.env.AWS_SHARED_CREDENTIALS_FILE = saved.AWS_SHARED_CREDENTIALS_FILE
      if (saved.AWS_CONFIG_FILE === undefined) delete process.env.AWS_CONFIG_FILE
      if (saved.AWS_SHARED_CREDENTIALS_FILE === undefined) delete process.env.AWS_SHARED_CREDENTIALS_FILE
    }
  })
})
