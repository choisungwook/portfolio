import type { Hono } from 'hono'
import { join, resolve } from 'node:path'
import { discoverSkills, skillRoots } from '../skills/discover.ts'
import { SkillError } from '../skills/inspect.ts'
import { configView, registerSkill, removeSkill, skillRows } from '../skills/registry.ts'
import { HttpError, readJson, type ApiDeps } from './http.ts'
import { desktopNotificationsEnabled, setDesktopNotifications } from '../db/meta.ts'

// Runtime config is read-only. The desktop notification preference is stored separately in SQLite.
export function registerSettingsRoutes(api: Hono, { db, config }: ApiDeps): void {
  api.get('/settings', (c) => c.json({
    config: configView(config),
    home: config.home,
    db_path: resolve(join(config.home, 'data', 'taskq.db')),
    access_skills: skillRows(db),
    desktop_notifications: desktopNotificationsEnabled(db),
  }))

  api.post('/settings/desktop-notifications', async (c) => {
    const body = await readJson(c) as { enabled?: unknown } | null
    if (typeof body?.enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean')
    setDesktopNotifications(db, body.enabled)
    return c.json({ enabled: body.enabled })
  })

  api.get('/skills/discover', (c) => c.json(discoverSkills(db, config, skillRoots(config))))

  api.post('/access-skills', async (c) => {
    const body = await readJson(c)
    const path = typeof body === 'object' && body !== null ? (body as { path?: unknown }).path : undefined
    if (typeof path !== 'string' || path === '') throw new HttpError(400, 'path is required')
    return c.json(asHttp(() => registerSkill(db, config.home, path)), 201)
  })

  api.delete('/access-skills/:name', (c) => {
    asHttp(() => removeSkill(db, c.req.param('name')))
    return c.body(null, 204)
  })
}

function asHttp<T>(fn: () => T): T {
  try {
    return fn()
  } catch (error) {
    if (error instanceof SkillError) throw new HttpError(error.status, error.message)
    throw error
  }
}
