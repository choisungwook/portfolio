import type { Hono } from 'hono'
import { addMcpServer, listMcpServers, removeMcpServer } from '../db/mcp-registry.ts'
import { join, resolve } from 'node:path'
import { discoverSkills, skillRoots } from '../skills/discover.ts'
import { SkillError } from '../skills/inspect.ts'
import { configView, registerSkill, removeSkill, skillRows } from '../skills/registry.ts'
import { HttpError, readJson, type ApiDeps } from './http.ts'
import {
  FONT_FAMILIES, FONT_SIZES, appearance, desktopNotificationsEnabled, queueAutorun, setAppearance, setDesktopNotifications, setQueueAutorun,
} from '../db/meta.ts'
import { botsUsing, listEntries, registerEntry, removeEntry, updateEntry, type RegistryKind } from '../db/bot-registry.ts'
import { sharedDir } from '../team/shared.ts'
import { sessionPaths } from '../open-folder.ts'
import { noteReload, reload } from '../team/bot-plugin.ts'
import { officialCatalog } from '../team/plugin-catalog.ts'
import { deleteInstalled, installedByTaskq, installPlugin } from '../team/plugin-install.ts'

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
    paths: { home: config.home, shared: sharedDir(config), sessions: sessionPaths() },
    font_families: FONT_FAMILIES,
    bot_skills: listEntries(db, 'skill'),
    bot_plugins: listEntries(db, 'plugin'),
    bot_mcp_servers: listMcpServers(db),
  }))

  // MCP servers for bots of both SDKs: { name, command, args: [...], description }.
  api.post('/bot-mcp-servers', async (c) => {
    const body = await readJson(c) as Record<string, unknown> | null
    try {
      return c.json(addMcpServer(db, {
        name: String(body?.name ?? ''), command: String(body?.command ?? ''),
        args: Array.isArray(body?.args) ? body.args as string[] : typeof body?.args === 'string' ? (body.args as string).split(/\s+/).filter(Boolean) : [],
        description: typeof body?.description === 'string' ? body.description : '',
      }), 201)
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : String(error))
    }
  })

  api.delete('/bot-mcp-servers/:name', (c) => {
    if (!removeMcpServer(db, c.req.param('name'))) throw new HttpError(404, `no MCP server named ${c.req.param('name')}`)
    return c.body(null, 204)
  })

  api.post('/settings/queue-autorun', async (c) => {
    const body = await readJson(c) as { enabled?: unknown } | null
    if (typeof body?.enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean')
    setQueueAutorun(db, body.enabled)
    return c.json({ enabled: body.enabled })
  })

  // Every field is optional; a missing one keeps its saved value.
  api.post('/settings/appearance', async (c) => {
    const body = await readJson(c) as { font_family?: unknown; font_size?: unknown; language?: unknown; theme?: unknown } | null
    const current = appearance(db)
    const family = body?.font_family ?? current.font_family
    const size = body?.font_size ?? current.font_size
    const language = body?.language ?? current.language
    const theme = body?.theme ?? current.theme
    if (language !== 'ko' && language !== 'en') throw new HttpError(400, 'language must be ko or en')
    if (theme !== 'system' && theme !== 'dark' && theme !== 'light') throw new HttpError(400, 'theme must be system, dark or light')
    if (typeof family !== 'string' || !(FONT_FAMILIES as readonly string[]).includes(family)) {
      throw new HttpError(400, `font_family must be one of ${FONT_FAMILIES.join(', ')}`)
    }
    if (!Number.isInteger(size) || (size as number) < FONT_SIZES.min || (size as number) > FONT_SIZES.max) {
      throw new HttpError(400, `font_size must be an integer from ${FONT_SIZES.min} to ${FONT_SIZES.max}`)
    }
    setAppearance(db, { font_family: family, font_size: size as number, language, theme })
    return c.json(appearance(db))
  })

  // The official marketplace. Each entry says whether taskq can install it (install is null otherwise).
  const catalog = async () => {
    try {
      return await officialCatalog()
    } catch (error) {
      throw new HttpError(502, `the official plugin list could not be loaded: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  api.get('/plugins/catalog', async (c) => c.json(await catalog()))

  // Installs one marketplace plugin at the commit the marketplace lists, and registers it for bots to pick. Installing
  // an installed plugin again replaces it with the marketplace's current commit and reloads the bots that use it.
  const install = async (name: string) => {
    const plugin = (await catalog()).plugins.find((p) => p.name === name)
    if (!plugin) throw new HttpError(404, `${name} is not in the official marketplace`)
    const entry = await asHttpAsync(() => installPlugin(db, config.home, plugin))
    const reloaded = entry.replaced ? botsUsing(db, 'plugin', name) : []
    for (const bot of reloaded) noteReload(db, bot, [reload(db, config, bot, 'plugin')])
    return { ...entry, reloaded }
  }
  api.post('/plugins/install', async (c) => {
    const body = await readJson(c) as { name?: unknown } | null
    if (typeof body?.name !== 'string' || body.name === '') throw new HttpError(400, 'name is required')
    return c.json(await install(body.name), 201)
  })

  // The global skill and plugin registry the bots pick from.
  for (const kind of ['skill', 'plugin'] as RegistryKind[]) {
    api.post(`/bot-${kind}s`, async (c) => {
      const body = await readJson(c) as { path?: unknown } | null
      if (typeof body?.path !== 'string' || body.path === '') throw new HttpError(400, 'path is required')
      const path = body.path
      return c.json(asHttp(() => registerEntry(db, config.home, kind, path)), 201)
    })
    // Updates a registered folder from its source: `git pull --ff-only` when it is a git checkout. Then every bot that
    // uses it reloads its copy, so the update reaches the bots' next turns.
    api.post(`/bot-${kind}s/:name/update`, async (c) => {
      const row = listEntries(db, kind).find((e) => e.name === c.req.param('name'))
      if (kind === 'plugin' && row && installedByTaskq(config.home, row.path)) {
        const entry = await install(row.name)
        return c.json({ method: 'marketplace', output: `reinstalled from the official marketplace`, reloaded: entry.reloaded })
      }
      const result = await updateEntry(db, kind, c.req.param('name'))
      if (!result) throw new HttpError(404, `no ${kind} named ${c.req.param('name')}`)
      const reloaded = botsUsing(db, kind, c.req.param('name'))
      for (const bot of reloaded) noteReload(db, bot, [reload(db, config, bot, kind)])
      return c.json({ ...result, reloaded })
    })
    // A plugin taskq installed is deleted with its row; a folder registered by path stays where it is.
    api.delete(`/bot-${kind}s/:name`, (c) => {
      const row = listEntries(db, kind).find((e) => e.name === c.req.param('name'))
      if (!removeEntry(db, kind, c.req.param('name'))) throw new HttpError(404, `no ${kind} named ${c.req.param('name')}`)
      if (kind === 'plugin' && row) deleteInstalled(config.home, row.name, row.path)
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

async function asHttpAsync<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof SkillError) throw new HttpError(error.status, error.message)
    throw error
  }
}

function asHttp<T>(fn: () => T): T {
  try {
    return fn()
  } catch (error) {
    if (error instanceof SkillError) throw new HttpError(error.status, error.message)
    throw error
  }
}
