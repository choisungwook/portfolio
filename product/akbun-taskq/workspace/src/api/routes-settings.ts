import type { Hono } from 'hono'
import { join, resolve } from 'node:path'
import { discoverSkills, skillRoots } from '../skills/discover.ts'
import { SkillError } from '../skills/inspect.ts'
import { configView, registerSkill, removeSkill, skillRows } from '../skills/registry.ts'
import { HttpError, readJson, type ApiDeps } from './http.ts'

// The config is read-only here. There is no route that changes it: a sandbox or auth setting changed from the page would be
// an attack path. Skill registration is the only write.
export function registerSettingsRoutes(api: Hono, { db, config }: ApiDeps): void {
  api.get('/settings', (c) => c.json({
    config: configView(config),
    home: config.home,
    db_path: resolve(join(config.home, 'data', 'taskq.db')),
    access_skills: skillRows(db),
  }))

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
