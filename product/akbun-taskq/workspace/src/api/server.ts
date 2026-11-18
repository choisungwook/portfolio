import { queueChanged } from '../wake.ts'
import { existsSync } from 'node:fs'
import { Hono } from 'hono'
import { serve, type ServerType } from '@hono/node-server'
import { HttpError, type ApiDeps } from './http.ts'
import { guard } from './guard.ts'
import { requireToken } from './auth.ts'
import { serveUi } from './static.ts'
import { resourcePath } from '../resources.ts'
import { registerTaskRoutes } from './routes-tasks.ts'
import { registerRunRoutes } from './routes-runs.ts'
import { registerAlertRoutes } from './routes-alerts.ts'
import { registerHandoffRoutes } from './routes-handoffs.ts'
import { registerApprovalRoutes } from './routes-approvals.ts'
import { registerMiscRoutes } from './routes-misc.ts'
import { registerSse } from './sse.ts'
import { registerSettingsRoutes } from './routes-settings.ts'
import { registerBotsRoutes } from './routes-bots.ts'
import { registerFileRoutes } from './routes-files.ts'

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
  // A successful write may make a task claimable or cancellable, so the runner looks at once instead of after pollSec.
  api.use('*', async (c, next) => {
    await next()
    if (c.req.method !== 'GET' && c.res.status < 400) queueChanged.notify()
  })
  registerTaskRoutes(api, deps)
  registerRunRoutes(api, deps)
  registerAlertRoutes(api, deps)
  registerHandoffRoutes(api, deps)
  registerApprovalRoutes(api, deps)
  registerMiscRoutes(api, deps)
  registerSettingsRoutes(api, deps)
  registerBotsRoutes(api, deps)
  registerFileRoutes(api, deps, deps.opener)
  registerSse(api, deps)
  app.route('/api', api)
  const index = resourcePath('ui/index.html')
  if (index && existsSync(index)) app.get('*', (c) => serveUi(c))
  return app
}

export function startServer(deps: ApiDeps, token: string): Promise<ServerType> {
  const app = createApp(deps, token)
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: deps.config.port }, () => resolve(server))
    server.once('error', reject)
  })
}
