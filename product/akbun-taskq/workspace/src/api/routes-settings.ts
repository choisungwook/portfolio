import type { Hono } from 'hono'
import { join, resolve } from 'node:path'
import { discoverSkills, skillRoots } from '../skills/discover.ts'
import { SkillError } from '../skills/inspect.ts'
import { configView, registerSkill, removeSkill, skillRows } from '../skills/registry.ts'
import { HttpError, readJson, type ApiDeps } from './http.ts'
import {
  FONT_FAMILIES, FONT_SIZES, appearance, desktopNotificationsEnabled, queueAutorun, setAppearance, setDesktopNotifications, setQueueAutorun,
} from '../db/meta.ts'
import { listEntries, registerEntry, removeEntry, type RegistryKind } from '../db/bot-registry.ts'

// Runtime config is read-only. The desktop notification preference is stored separately in SQLite.
export function registerSettingsRoutes(api: Hono, { db, config }: ApiDeps): void {
  api.get('/settings', (c) => c.json({
    config: configView(config),
    home: config.home,
    db_path: resolve(join(config.home, 'data', 'taskq.db')),
    access_skills: skillRows(db),
    desktop_notifications: desktopNotificationsEnabled(db),
    queue_autorun: queueAutorun(db),
    appearance: appearance(db),
    font_families: FONT_FAMILIES,
    bot_skills: listEntries(db, 'skill'),
    bot_plugins: listEntries(db, 'plugin'),
  }))

  api.post('/settings/queue-autorun', async (c) => {
    const body = await readJson(c) as { enabled?: unknown } | null
    if (typeof body?.enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean')
    setQueueAutorun(db, body.enabled)
    return c.json({ enabled: body.enabled })
  })

  api.post('/settings/appearance', async (c) => {
    const body = await readJson(c) as { font_family?: unknown; font_size?: unknown } | null
    const family = body?.font_family
    const size = body?.font_size
    if (typeof family !== 'string' || !(FONT_FAMILIES as readonly string[]).includes(family)) {
      throw new HttpError(400, `font_family must be one of ${FONT_FAMILIES.join(', ')}`)
    }
    if (!Number.isInteger(size) || (size as number) < FONT_SIZES.min || (size as number) > FONT_SIZES.max) {
      throw new HttpError(400, `font_size must be an integer from ${FONT_SIZES.min} to ${FONT_SIZES.max}`)
    }
    setAppearance(db, { font_family: family, font_size: size as number })
    return c.json(appearance(db))
  })

  // The global skill and plugin registry the bots pick from.
  for (const kind of ['skill', 'plugin'] as RegistryKind[]) {
    api.post(`/bot-${kind}s`, async (c) => {
      const body = await readJson(c) as { path?: unknown } | null
      if (typeof body?.path !== 'string' || body.path === '') throw new HttpError(400, 'path is required')
      const path = body.path
      return c.json(asHttp(() => registerEntry(db, config.home, kind, path)), 201)
    })
    api.delete(`/bot-${kind}s/:name`, (c) => {
      if (!removeEntry(db, kind, c.req.param('name'))) throw new HttpError(404, `no ${kind} named ${c.req.param('name')}`)
      return c.body(null, 204)
    })
  }

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
