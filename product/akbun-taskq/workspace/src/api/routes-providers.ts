import type { Hono } from 'hono'
import { kiroSso, loginState, setKiroSso, startLogin, whoami } from '../agents/kiro/login.ts'
import { PERIODS, usageReport, type Period } from '../db/usage.ts'
import { HttpError, optionalJson, type ApiDeps } from './http.ts'

// Sign-in for the SDKs that keep their own session (Kiro), and the Usage page.
export function registerProviderRoutes(api: Hono, { db, config }: ApiDeps): void {
  api.get('/kiro/status', async (c) => c.json({ sso: kiroSso(db), login: loginState(), whoami: await whoami(config) }))

  // { "start_url": "https://<name>.awsapps.com/start", "region": "us-east-1" }: saves them and starts the device-flow
  // login; the answer carries the verification URL and code to open in a browser.
  api.post('/kiro/login', async (c) => {
    const body = await optionalJson(c)
    const sso = { start_url: String(body.start_url ?? kiroSso(db).start_url).trim(), region: String(body.region ?? kiroSso(db).region).trim() }
    const problem = setKiroSso(db, sso)
    if (problem) throw new HttpError(400, problem)
    return c.json(await startLogin(config, sso))
  })

  // Tokens and cost per SDK, per bot session, and for one-off task runs. ?period=today|7d|30d|all
  api.get('/usage', (c) => {
    const period = (c.req.query('period') ?? '7d') as Period
    if (!PERIODS.includes(period)) throw new HttpError(400, `period must be one of ${PERIODS.join(', ')}`)
    return c.json(usageReport(db, period))
  })
}
