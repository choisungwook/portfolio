import type { Hono } from 'hono'
import { createReadStream, statSync } from 'node:fs'
import { basename } from 'node:path'
import { Readable } from 'node:stream'
import { HttpError, readJson, type ApiDeps } from './http.ts'
import { listShared, resolveShared, saveAttachment, sharedDir, UPLOAD_LIMIT } from '../team/shared.ts'
import { agentDir } from '../team/prompt.ts'
import { getAgent } from '../db/team.ts'
import { claudeProjectsDir, existing, openWithSystem, sessionFolder, type Opener } from '../open-folder.ts'

// Uploads arrive as JSON with base64 data, so the API keeps its one rule for writes (application/json only).
export function registerFileRoutes(api: Hono, { config, db }: ApiDeps, open: Opener = openWithSystem): void {
  api.post('/files', async (c) => {
    const body = await readJson(c) as { name?: unknown; data?: unknown } | null
    if (typeof body?.name !== 'string' || !body.name.trim()) throw new HttpError(400, 'name is required')
    if (typeof body.data !== 'string' || !/^[A-Za-z0-9+/=\s]*$/.test(body.data)) throw new HttpError(400, 'data must be base64')
    const data = Buffer.from(body.data, 'base64')
    if (data.length > UPLOAD_LIMIT) throw new HttpError(413, `a file may be at most ${UPLOAD_LIMIT / 1024 / 1024} MB`)
    const path = saveAttachment(config, body.name, data)
    return c.json({ path, name: basename(path), size: data.length }, 201)
  })

  api.get('/shared', (c) => {
    const entries = listShared(config, c.req.query('dir') ?? '')
    if (!entries) throw new HttpError(400, 'dir must be inside the shared folder')
    return c.json({ root: sharedDir(config), entries })
  })

  api.get('/shared/file', (c) => {
    const path = resolveShared(config, c.req.query('path') ?? '')
    if (!path) throw new HttpError(400, 'path must be inside the shared folder')
    let size: number
    try {
      const stat = statSync(path)
      if (!stat.isFile()) throw new Error('not a file')
      size = stat.size
    } catch {
      throw new HttpError(404, 'no such file')
    }
    c.header('content-type', 'application/octet-stream')
    c.header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(basename(path))}`)
    c.header('content-length', String(size))
    return c.body(Readable.toWeb(createReadStream(path)) as ReadableStream)
  })

  // Opens one of taskq's own folders on this machine: the shared folder, TASKQ_HOME, the Claude session transcripts,
  // or one bot's session folder. Returns the path either way, so the UI can show and copy it.
  api.post('/open-folder', async (c) => {
    const body = await readJson(c) as { target?: unknown; bot?: unknown } | null
    let path: string | null
    switch (body?.target) {
      case 'shared': path = sharedDir(config); break
      case 'home': path = config.home; break
      case 'sessions': path = existing(claudeProjectsDir()); break
      case 'bot': {
        const bot = typeof body.bot === 'string' ? getAgent(db, body.bot) : undefined
        if (!bot) throw new HttpError(404, 'no such bot')
        path = existing(sessionFolder(bot.workdir ?? agentDir(config, bot.name)))
        break
      }
      default: throw new HttpError(400, 'target must be shared, home, sessions or bot')
    }
    if (!path) throw new HttpError(404, 'that folder does not exist yet; it appears after the first session')
    open(path)
    return c.json({ path })
  })
}
