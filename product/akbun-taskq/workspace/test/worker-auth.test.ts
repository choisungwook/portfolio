import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { resolveConfig } from '../src/config.ts'
import { buildEnv, preflight } from '../src/worker/auth.ts'

// Placeholder values only; no key-shaped literals appear in the source.
const base = {
  PATH: '/usr/bin',
  ANTHROPIC_API_KEY: 'placeholder-api-key',
  ANTHROPIC_AUTH_TOKEN: 'placeholder-auth-token',
  CLAUDE_CODE_OAUTH_TOKEN: 'placeholder-oauth',
  CLAUDE_CODE_USE_VERTEX: '1',
  CLAUDE_CODE_USE_FOUNDRY: '1',
}

describe('buildEnv', () => {
  const home = '/home/example-taskq'

  test('bedrock sets the provider flag, region and inference profile and removes other providers', () => {
    const env = buildEnv(resolveConfig(home, { provider: 'bedrock', awsRegion: 'us-west-2', inferenceProfile: 'infer' }), base)
    assert.equal(env.CLAUDE_CODE_USE_BEDROCK, '1')
    assert.equal(env.AWS_REGION, 'us-west-2')
    assert.equal(env.AWS_PROFILE, 'infer')
    assert.equal(env.CLAUDE_CODE_USE_VERTEX, undefined)
    assert.equal(env.CLAUDE_CODE_USE_FOUNDRY, undefined)
    assert.equal(env.PATH, '/usr/bin')
  })

  test('api_key passes ANTHROPIC_API_KEY through and removes the provider flags', () => {
    const env = buildEnv(resolveConfig(home, { provider: 'api_key' }), base)
    assert.equal(env.ANTHROPIC_API_KEY, 'placeholder-api-key')
    assert.equal(env.CLAUDE_CODE_USE_VERTEX, undefined)
    assert.equal(env.CLAUDE_CODE_USE_FOUNDRY, undefined)
    assert.equal(env.CLAUDE_CODE_USE_BEDROCK, undefined)
  })

  test('subscription removes the API key, the auth token and the provider flags', () => {
    const env = buildEnv(resolveConfig(home, { provider: 'subscription' }), base)
    assert.equal(env.ANTHROPIC_API_KEY, undefined)
    assert.equal(env.ANTHROPIC_AUTH_TOKEN, undefined)
    assert.equal(env.CLAUDE_CODE_USE_VERTEX, undefined)
    assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, 'placeholder-oauth')
  })

  test('bedrock removes environment credentials so the inference profile is the only identity', () => {
    const withKeys = {
      ...base,
      AWS_ACCESS_KEY_ID: 'placeholder-access-key',
      AWS_SECRET_ACCESS_KEY: 'placeholder-secret',
      AWS_SESSION_TOKEN: 'placeholder-session',
      AWS_BEARER_TOKEN_BEDROCK: 'placeholder-bearer',
    }
    const env = buildEnv(resolveConfig(home, { provider: 'bedrock', inferenceProfile: 'infer' }), withKeys)
    assert.equal(env.AWS_ACCESS_KEY_ID, undefined)
    assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined)
    assert.equal(env.AWS_SESSION_TOKEN, undefined)
    assert.equal(env.AWS_BEARER_TOKEN_BEDROCK, undefined)
    assert.equal(env.AWS_PROFILE, 'infer')
  })

  test('api_key and subscription remove AWS_PROFILE so target commands must name a profile', () => {
    const withProfile = { ...base, AWS_PROFILE: 'target', AWS_DEFAULT_PROFILE: 'target' }
    for (const provider of ['api_key', 'subscription'] as const) {
      const env = buildEnv(resolveConfig(home, { provider }), withProfile)
      assert.equal(env.AWS_PROFILE, undefined, provider)
      assert.equal(env.AWS_DEFAULT_PROFILE, undefined, provider)
    }
  })

  test('[critical] nothing outside the allow-list reaches the child, for any provider', () => {
    const parent = {
      ...base,
      FOO_SECRET: 'placeholder-foo',
      AWS_ACCESS_KEY_ID: 'placeholder-access-key',
      AWS_SECRET_ACCESS_KEY: 'placeholder-secret',
      GITHUB_TOKEN: 'placeholder-github',
    }
    for (const provider of ['bedrock', 'api_key', 'subscription'] as const) {
      const env = buildEnv(resolveConfig(home, { provider, inferenceProfile: 'infer' }), parent)
      assert.equal(env.FOO_SECRET, undefined, provider)
      assert.equal(env.AWS_ACCESS_KEY_ID, undefined, provider)
      assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined, provider)
      assert.equal(env.GITHUB_TOKEN, undefined, provider)
    }
  })

  test('the allow-list passes the shell, proxy, CA and model variables through', () => {
    const parent = {
      PATH: '/usr/bin', HOME: '/h', LC_ALL: 'C.UTF-8', https_proxy: 'http://proxy.example:3128', NO_PROXY: 'localhost',
      NODE_EXTRA_CA_CERTS: '/etc/ca.pem', AWS_CONFIG_FILE: '/cfg', CLAUDE_CONFIG_DIR: '/claude', ANTHROPIC_DEFAULT_SONNET_MODEL: 'm',
    }
    const env = buildEnv(resolveConfig(home, { provider: 'subscription' }), parent)
    assert.equal(env.HOME, '/h')
    assert.equal(env.LC_ALL, 'C.UTF-8')
    assert.equal(env.https_proxy, 'http://proxy.example:3128')
    assert.equal(env.NO_PROXY, 'localhost')
    assert.equal(env.NODE_EXTRA_CA_CERTS, '/etc/ca.pem')
    assert.equal(env.AWS_CONFIG_FILE, '/cfg')
    assert.equal(env.CLAUDE_CONFIG_DIR, '/claude')
    assert.equal(env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'm')
  })

  test('api_key passes the key from the parent and nothing else of the subscription login', () => {
    const env = buildEnv(resolveConfig(home, { provider: 'api_key' }), { ...base, CLAUDE_CODE_OAUTH_TOKEN: 'placeholder-oauth' })
    assert.equal(env.ANTHROPIC_API_KEY, 'placeholder-api-key')
    assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, undefined)
  })

  test('subscription passes the OAuth token only when it is set', () => {
    const withToken = buildEnv(resolveConfig(home, { provider: 'subscription' }), base)
    assert.equal(withToken.CLAUDE_CODE_OAUTH_TOKEN, 'placeholder-oauth')
    const without = buildEnv(resolveConfig(home, { provider: 'subscription' }), { PATH: '/usr/bin' })
    assert.equal(without.CLAUDE_CODE_OAUTH_TOKEN, undefined)
  })

  test('the base environment is not mutated', () => {
    const copy = { ...base }
    buildEnv(resolveConfig(home, { provider: 'subscription' }), base)
    assert.deepEqual(base, copy)
  })
})

describe('preflight without network', () => {
  test('subscription is always ok', async () => {
    assert.deepEqual(await preflight(resolveConfig('/h', { provider: 'subscription' }), {}), { ok: true })
  })

  test('api_key fails when the variable is missing and passes when it is set', async () => {
    const config = resolveConfig('/h', { provider: 'api_key' })
    assert.equal((await preflight(config, {})).ok, false)
    assert.equal((await preflight(config, { ANTHROPIC_API_KEY: 'placeholder' })).ok, true)
  })
})
