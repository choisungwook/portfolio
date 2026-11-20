import type { Hono } from 'hono'
import { kiroSso, loginState, setKiroSso, startLogin, whoami } from '../agents/kiro/login.ts'
import { PERIODS, usageReport, type Period } from '../db/usage.ts'
import { botConnection, clearConnectionCache, listConnections } from '../team/connections.ts'
import { connectionSettings, saveConnectionSettings } from '../team/connection-settings.ts'
import { listProfiles } from '../aws/profiles.ts'
import { readApiKey, saveApiKey } from '../agents/claude/api-key.ts'
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

  // Every connection with its check, the bots on it and its last turn. Checks are cached for a minute; ?refresh=1 reruns.
  api.get('/connections', async (c) => c.json(await listConnections(db, config, { refresh: c.req.query('refresh') === '1' })))

  // How Claude and OpenAI-on-Bedrock sign in: provider, region and AWS profile. Saving applies at once and reruns checks.
  // The API key is write-only: answers say only whether one is saved. Omitted or "" in a PUT keeps it; null removes it.
  const withKey = <T extends object>(s: T) => ({ ...s, claude_api_key_set: readApiKey(config) !== undefined })
  api.get('/connection-settings', (c) => c.json(withKey(connectionSettings(config))))
  api.put('/connection-settings', async (c) => {
    const body = await optionalJson(c)
    const key = body.claude_api_key
    if (key === null || (typeof key === 'string' && key.trim())) {
      const problem = saveApiKey(config, key ?? '')
      if (problem) throw new HttpError(400, problem)
    }
    const saved = saveConnectionSettings(db, config, body)
    if (typeof saved === 'string') throw new HttpError(400, saved)
    clearConnectionCache()
    return c.json(withKey(saved))
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
