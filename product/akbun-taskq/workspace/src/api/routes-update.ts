import type { Hono } from 'hono'
import { checkUpdate, installProgress, installUpdate } from '../update.ts'
import { HttpError, type ApiDeps } from './http.ts'

// Settings > Update: whether a newer release exists, and installing it over the running binary (restart to use it).
export function registerUpdateRoutes(api: Hono, deps: ApiDeps): void {
  const fetcher = deps.fetcher ?? fetch
  api.get('/update', async (c) => {
    try {
      return c.json(await checkUpdate(fetcher, deps.binary))
    } catch (error) {
      throw new HttpError(502, error instanceof Error ? error.message : String(error))
    }
  })
  // The running install's progress, polled by the Install button while POST /update is still downloading.
  api.get('/update/progress', (c) => c.json(installProgress()))
  api.post('/update', async (c) => {
    try {
      const version = await installUpdate(fetcher, deps.updateTarget, deps.binary)
      return c.json({ installed: version, restart: true })
    } catch (error) {
      throw new HttpError(409, error instanceof Error ? error.message : String(error))
    }
  })
}
