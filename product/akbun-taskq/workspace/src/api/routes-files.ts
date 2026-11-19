import { existsSync } from 'node:fs'
import type { Hono } from 'hono'
import { createReadStream, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { HttpError, readJson, type ApiDeps } from './http.ts'
import { botWorkdir, listShared, resolveShared, saveAttachment, sharedDir, sharedRelative, UPLOAD_LIMIT } from '../team/shared.ts'
import { getAgent } from '../db/team.ts'
import { getTask } from '../db/tasks.ts'
import { claudeProjectsDir, existing, openWithSystem, sessionFolder, type Opener } from '../open-folder.ts'

// Document kinds "Open" hands to the system app. Scripts and executables are left out on purpose.
const OPENABLE = new Set([
  'pdf', 'ppt', 'pptx', 'key', 'odp', 'doc', 'docx', 'odt', 'rtf', 'pages', 'xls', 'xlsx', 'ods', 'numbers', 'csv', 'tsv',
  'txt', 'md', 'markdown', 'html', 'htm', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic', 'mp4', 'mov', 'mp3',
  'wav', 'zip',
])

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

  // Opens a file of the shared folder with its default app on this machine, or with { reveal: true } the folder that
  // holds it. Bots write this folder, so only document kinds open with an app, and never a file with an exec bit: a
  // .command, .bat or .desktop a bot left there would otherwise run outside its sandbox on one click.
  api.post('/open-file', async (c) => {
    const body = await readJson(c) as { path?: unknown; reveal?: unknown } | null
    const rel = typeof body?.path === 'string' ? sharedRelative(config, body.path) : null
    if (!rel) throw new HttpError(404, 'no such file in the shared folder')
    const full = join(sharedDir(config), rel)
    const reveal = body?.reveal === true
    if (!reveal && (!OPENABLE.has(extname(rel).slice(1).toLowerCase()) || (statSync(full).mode & 0o111) !== 0)) {
      throw new HttpError(400, 'this kind of file does not open from taskq; show it in the shared folder or download it')
    }
    open(reveal ? dirname(full) : full)
    return c.json({ path: full })
  })

  // Opens one of taskq's own folders on this machine: the shared folder, TASKQ_HOME, the Claude session transcripts,
  // or one bot's session folder. Returns the path either way, so the UI can show and copy it.
  api.post('/open-folder', async (c) => {
    const body = await readJson(c) as { target?: unknown; bot?: unknown; task_id?: unknown } | null
    let path: string | null
    switch (body?.target) {
      case 'shared': path = sharedDir(config); break
      case 'home': path = config.home; break
      case 'sessions': path = existing(claudeProjectsDir()); break
      case 'bot': {
        const bot = typeof body.bot === 'string' ? getAgent(db, body.bot) : undefined
        if (!bot) throw new HttpError(404, 'no such bot')
        path = existing(sessionFolder(botWorkdir(config, bot)))
        break
      }
      case 'task': {
        const task = typeof body.task_id === 'string' ? getTask(db, body.task_id) : undefined
        if (!task) throw new HttpError(404, 'no such task')
        path = task.data.repo && existsSync(task.data.repo) ? task.data.repo : null
        break
      }
      default: throw new HttpError(400, 'target must be shared, home, sessions, bot or task')
    }
    if (!path) throw new HttpError(404, 'that folder does not exist yet; it appears after the first session')
    open(path)
    return c.json({ path })
  })
}
