import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { serve, type ServerType } from '@hono/node-server'
import { HttpError, type ApiDeps } from './http.ts'
import { guard } from './guard.ts'
import { requireToken } from './auth.ts'
import { serveUi } from './static.ts'
import { registerTaskRoutes } from './routes-tasks.ts'
import { registerRunRoutes } from './routes-runs.ts'
import { registerAlertRoutes } from './routes-alerts.ts'
import { registerApprovalRoutes } from './routes-approvals.ts'
import { registerMiscRoutes } from './routes-misc.ts'
import { registerSse } from './sse.ts'
import { registerSettingsRoutes } from './routes-settings.ts'

const UI_DIR = fileURLToPath(new URL('../../ui', import.meta.url))

export function createApp(deps: ApiDeps, token: string): Hono {
  const app = new Hono()
  const api = new Hono()
  app.use('*', guard(deps.config.port))
  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ error: error.message }, error.status as 400)
    console.error(error)
    return c.json({ error: 'internal error' }, 500)
  })
  api.use('*', requireToken(token))
  registerTaskRoutes(api, deps)
  registerRunRoutes(api, deps)
  registerAlertRoutes(api, deps)
  registerApprovalRoutes(api, deps)
  registerMiscRoutes(api, deps)
  registerSettingsRoutes(api, deps)
  registerSse(api, deps)
  app.route('/api', api)
  if (existsSync(UI_DIR)) app.get('*', (c) => serveUi(c, UI_DIR))
  return app
}

export function startServer(deps: ApiDeps, token: string): Promise<ServerType> {
  const app = createApp(deps, token)
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: deps.config.port }, () => resolve(server))
    server.once('error', reject)
  })
}
