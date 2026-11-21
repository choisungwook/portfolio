import type { Hono } from 'hono'
import { addKiroConnection, kiroConnections, kiroSso, loginState, removeKiroConnection, selectKiroConnection, setKiroSso, startLogin, whoami } from '../agents/kiro/login.ts'
import { caBundleInfo, clearCaBundle, saveCaBundle } from '../ca-bundle.ts'
import { PERIODS, usageReport, type Period } from '../db/usage.ts'
import { botConnection, clearConnectionCache, IDS, listConnections, testConnection, type ConnectionId } from '../team/connections.ts'
import { clearConnectionSettings, connectionSettings, saveConnectionSettings, type Runtime } from '../team/connection-settings.ts'
import { listProfiles } from '../aws/profiles.ts'
import { apiKeyProblem, readApiKey, readOpenaiKey, saveApiKey, saveOpenaiKey } from '../agents/claude/api-key.ts'
import { HttpError, optionalJson, type ApiDeps } from './http.ts'

// Connections (how bots reach their models and whether that works), sign-in for the SDKs that keep their own session
// (Kiro), and the Usage page.
export function registerProviderRoutes(api: Hono, { db, config }: ApiDeps): void {
  api.get('/kiro/status', async (c) => {
    clearConnectionCache('kiro')
    return c.json({ sso: kiroSso(db), login: loginState(), whoami: await whoami(config) })
  })

  // { "start_url": "https://<name>.awsapps.com/start", "region": "us-east-1" }: saves them and starts the device-flow
  // login; the answer carries the verification URL and code to open in a browser.
  api.post('/kiro/login', async (c) => {
    const body = await optionalJson(c)
    const sso = { start_url: String(body.start_url ?? kiroSso(db).start_url).trim(), region: String(body.region ?? kiroSso(db).region).trim() }
    const problem = setKiroSso(db, sso)
    if (problem) throw new HttpError(400, problem)
    clearConnectionCache('kiro')
    return c.json(await startLogin(config, sso))
  })

  // Kiro's IAM Identity Center connections: several can be kept, one is in use (kiro-cli holds one login at a time, so
  // switching means signing in again). { name, start_url, region } adds; PUT .../active switches; DELETE removes.
  const kiroAnswer = (result: ReturnType<typeof kiroConnections> | string) => {
    if (typeof result === 'string') throw new HttpError(400, result)
    clearConnectionCache('kiro')
    return result
  }
  api.get('/kiro/connections', (c) => c.json(kiroConnections(db)))
  api.post('/kiro/connections', async (c) => {
    const body = await optionalJson(c)
    return c.json(kiroAnswer(addKiroConnection(db, { name: String(body.name ?? ''), start_url: String(body.start_url ?? ''), region: String(body.region ?? '') })), 201)
  })
  api.put('/kiro/connections/:id/active', (c) => c.json(kiroAnswer(selectKiroConnection(db, c.req.param('id')))))
  api.delete('/kiro/connections/:id', (c) => c.json(kiroAnswer(removeKiroConnection(db, c.req.param('id')))))

  // The root certificate of a TLS inspection device, imported as PEM text ({ pem }); every runtime then trusts it.
  api.get('/ca-bundle', (c) => c.json(caBundleInfo(db, config)))
  api.put('/ca-bundle', async (c) => {
    const body = await optionalJson(c)
    if (typeof body.pem !== 'string') throw new HttpError(400, 'pem must be the text of a PEM file')
    const saved = saveCaBundle(db, config, body.pem)
    if (typeof saved === 'string') throw new HttpError(400, saved)
    clearConnectionCache()
    return c.json(saved)
  })
  api.delete('/ca-bundle', (c) => {
    const info = clearCaBundle(db, config)
    clearConnectionCache()
    return c.json(info)
  })

  // Every connection with its check, the bots on it and its last turn. Checks are cached for a minute; ?refresh=1 reruns.
  api.get('/connections', async (c) => c.json(await listConnections(db, config, { refresh: c.req.query('refresh') === '1' })))

  // How Claude and OpenAI-on-Bedrock sign in: provider, region and AWS profile. Saving applies at once and reruns checks.
  // The API key is write-only: answers say only whether one is saved. Omitted or "" in a PUT keeps it; null removes it.
  const withKey = <T extends object>(s: T) => ({
    ...s, kiro_start_url: kiroSso(db).start_url, kiro_region: kiroSso(db).region,
    claude_api_key_set: readApiKey(config) !== undefined, openai_api_key_set: readOpenaiKey(config) !== undefined,
  })
  api.get('/connection-settings', (c) => c.json(withKey(connectionSettings(config))))
  api.put('/connection-settings', async (c) => {
    const body = await optionalJson(c)
    const key = body.claude_api_key
    const changeKey = key === null || (typeof key === 'string' && key.trim() !== '')
    const problem = typeof key === 'string' && changeKey ? apiKeyProblem(key) : null
    if (problem) throw new HttpError(400, problem)
    const openai = body.openai_api_key
    const changeOpenai = openai === null || (typeof openai === 'string' && openai.trim() !== '')
    const openaiProblem = typeof openai === 'string' && changeOpenai ? apiKeyProblem(openai) : null
    if (openaiProblem) throw new HttpError(400, openaiProblem.replace('claude_api_key', 'openai_api_key'))
    if (typeof body.kiro_start_url === 'string' && body.kiro_start_url.trim()) {
      const problem = setKiroSso(db, { start_url: body.kiro_start_url.trim(), region: String(body.kiro_region ?? kiroSso(db).region).trim() })
      if (problem) throw new HttpError(400, problem)
    }
    const saved = saveConnectionSettings(db, config, body)
    if (typeof saved === 'string') throw new HttpError(400, saved)
    if (changeKey) saveApiKey(config, typeof key === 'string' ? key : '')
    if (changeOpenai) saveOpenaiKey(config, typeof openai === 'string' ? openai : '')
    clearConnectionCache()
    return c.json(withKey(saved))
  })
  // Clear on one runtime: its saved sign-in (and saved key) goes; the config file and environment apply again.
  api.delete('/connection-settings/:runtime', (c) => {
    const runtime = c.req.param('runtime') as Runtime
    if (!['claude', 'openai', 'kiro'].includes(runtime)) throw new HttpError(400, 'runtime must be claude, openai or kiro')
    clearConnectionSettings(db, config, runtime)
    if (runtime === 'claude') saveApiKey(config, '')
    if (runtime === 'openai') saveOpenaiKey(config, '')
    clearConnectionCache()
    return c.json(withKey(connectionSettings(config)))
  })
  // The Connection test button: one connection's check, rerun now with a 5 second limit.
  api.post('/connections/test', async (c) => {
    const body = await optionalJson(c)
    const id = String(body.id ?? '') as ConnectionId
    if (!IDS.includes(id)) throw new HttpError(400, `id must be one of ${IDS.join(', ')}`)
    return c.json(await testConnection(db, config, id))
  })
  // The AWS profiles on this machine (names, how each signs in, region); never keys.
  api.get('/aws/profiles', (c) => c.json(listProfiles()))

  // One bot's connection and the first reason it would not answer (paused, bot off, connection, last turn).
  api.get('/bots/:name/connection', async (c) => {
    const found = await botConnection(db, config, c.req.param('name'), { refresh: c.req.query('refresh') === '1' })
    if (!found) throw new HttpError(404, 'no such bot')
    return c.json(found)
  })

  // Tokens and cost per SDK, per bot session, and for one-off task runs. ?period=today|7d|30d|all
  api.get('/usage', (c) => {
    const period = (c.req.query('period') ?? '7d') as Period
    if (!PERIODS.includes(period)) throw new HttpError(400, `period must be one of ${PERIODS.join(', ')}`)
    return c.json(usageReport(db, period))
  })
}
