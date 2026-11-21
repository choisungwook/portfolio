import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import pkg from '../package.json' with { type: 'json' }
import { isEmbedded } from './resources.ts'

// Updating taskq from Settings: the newest akbun-taskq release on GitHub, and for the single-file binary, replacing the
// running executable with that release's build for this machine. The new version starts with the next `taskq run`.

const RELEASES = 'https://api.github.com/repos/choisungwook/portfolio/releases?per_page=50'
const TAG = 'akbun-taskq-v'

export interface Release { version: string; tag: string; url: string; assets: { name: string; url: string }[] }
export interface UpdateStatus {
  current: string
  latest: string | null
  update_available: boolean
  can_install: boolean
  reason?: string          // why can_install is false
  release_url?: string
}

// a.b.c compared as numbers; true when b is newer than a.
export function newer(a: string, b: string): boolean {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i += 1) if ((y[i] ?? 0) !== (x[i] ?? 0)) return (y[i] ?? 0) > (x[i] ?? 0)
  return false
}

// The release asset built for this machine. The release workflow builds only darwin-arm64.
export function assetName(platform = process.platform, arch = process.arch): string | null {
  if (platform === 'darwin' && arch === 'arm64') return 'taskq-darwin-arm64.tar.gz'
  return null
}

// The single-file binary (scripts/build-binary.ts registers its embedded files); a checkout runs under node.
export const isBinary = isEmbedded

export async function latestRelease(fetcher: typeof fetch = fetch): Promise<Release | null> {
  const res = await fetcher(RELEASES, { headers: { accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub releases: HTTP ${res.status}`)
  const list = await res.json() as { tag_name: string; html_url: string; draft: boolean; prerelease: boolean; assets: { name: string; browser_download_url: string }[] }[]
  const release = list.find((r) => r.tag_name.startsWith(TAG) && !r.draft && !r.prerelease)
  if (!release) return null
  return {
    version: release.tag_name.slice(TAG.length), tag: release.tag_name, url: release.html_url,
    assets: release.assets.map((a) => ({ name: a.name, url: a.browser_download_url })),
  }
}

export async function checkUpdate(fetcher: typeof fetch = fetch, binary = isBinary()): Promise<UpdateStatus> {
  const release = await latestRelease(fetcher)
  const current = pkg.version
  const available = release !== null && newer(current, release.version)
  const status: UpdateStatus = { current, latest: release?.version ?? null, update_available: available, can_install: false, release_url: release?.url }
  if (!binary) status.reason = 'taskq runs from a checkout: update it with git pull and npm ci'
  else if (!assetName()) status.reason = `no release build for ${process.platform}-${process.arch}`
  else if (!release?.assets.some((a) => a.name === assetName())) status.reason = 'the latest release has no build for this machine'
  else status.can_install = available
  return status
}

// How far the running install is, for the progress bar in Settings > Update. total is null when GitHub sends no length.
export interface InstallProgress { phase: 'idle' | 'download' | 'unpack' | 'done' | 'failed'; received: number; total: number | null }
let progress: InstallProgress = { phase: 'idle', received: 0, total: null }
export const installProgress = (): InstallProgress => ({ ...progress })

// Reads the body chunk by chunk so the progress moves while it downloads.
async function download(res: Response): Promise<Buffer> {
  const length = Number(res.headers.get('content-length'))
  progress = { phase: 'download', received: 0, total: length > 0 ? length : null }
  if (!res.body) return Buffer.from(await res.arrayBuffer())
  const chunks: Uint8Array[] = []
  for await (const chunk of res.body) {
    chunks.push(chunk)
    progress.received += chunk.byteLength
  }
  return Buffer.concat(chunks)
}

// Downloads the release build, unpacks it next to the running executable and swaps it in with a rename, so a failed
// download or unpack never leaves a half-written taskq. Returns the installed version.
export async function installUpdate(fetcher: typeof fetch = fetch, target = process.execPath, binary = isBinary()): Promise<string> {
  try {
    const version = await install(fetcher, target, binary)
    progress = { ...progress, phase: 'done' }
    return version
  } catch (error) {
    progress = { ...progress, phase: 'failed' }
    throw error
  }
}

async function install(fetcher: typeof fetch, target: string, binary: boolean): Promise<string> {
  progress = { phase: 'download', received: 0, total: null }
  const status = await checkUpdate(fetcher, binary)
  if (!status.can_install) throw new Error(status.reason ?? `taskq ${status.current} is already the latest`)
  const release = (await latestRelease(fetcher))!
  const asset = release.assets.find((a) => a.name === assetName())!
  const url = new URL(asset.url)
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') throw new Error('the release asset is not on github.com')
  const res = await fetcher(url)
  if (!res.ok) throw new Error(`download: HTTP ${res.status}`)
  const work = mkdtempSync(join(tmpdir(), 'taskq-update-'))
  try {
    const archive = join(work, asset.name)
    writeFileSync(archive, await download(res))
    progress.phase = 'unpack'
    // Only the one entry, and only a regular file: a link in the archive must not put another file in taskq's place.
    execFileSync('tar', ['-xzf', archive, '-C', work, 'taskq'])
    const built = join(work, 'taskq')
    if (!existsSync(built) || !lstatSync(built).isFile()) throw new Error('the archive has no taskq executable')
    const staged = join(dirname(target), '.taskq-update')
    try {
      copyFileSync(built, staged)
      chmodSync(staged, 0o755)
      renameSync(staged, target)
    } catch (error) {
      rmSync(staged, { force: true })
      throw error
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  return release.version
}
