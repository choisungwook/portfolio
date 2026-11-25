// Self update from this repository's GitHub releases (tags akbun-piano-teacher-v<version>).
// macOS: the build is unsigned, so Squirrel.Mac cannot install it. The dmg is downloaded and a detached script swaps
// the .app bundle after the app quits. A file the app fetched itself carries no quarantine attribute, so Gatekeeper
// does not block the new bundle. Windows uses electron-updater instead (main.ts); this module only finds the release.
//
// The dmg is large, so three cleanup points keep it from filling the disk (test/update.test.ts checks all three):
// 1. downloadDmg removes its directory when the download fails.
// 2. The swap script removes its work directory and mount on EXIT, whatever step failed.
// 3. cleanupTempDirs removes what a killed app or script left behind, at every start.
// This module must not import electron, so tests run without an app binary.

import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const REPO = 'choisungwook/portfolio'
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases`
export const TAG_PREFIX = 'akbun-piano-teacher-v'
const TEMP_PREFIX = 'akbun-piano-teacher-update-'

export type UpdateCheck = {
  current: string
  latest: string | null
  tag: string | null
  url: string | null
  dmgUrl: string | null
  hasUpdate: boolean
}

type Asset = { name: string; browser_download_url: string }

export function compareVersion(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((left[i] ?? 0) !== (right[i] ?? 0)) return (left[i] ?? 0) - (right[i] ?? 0)
  }
  return 0
}

// electron-builder suffixes only the arm64 dmg (-arm64.dmg); the x64 one has no suffix.
export function pickDmg(assets: Asset[], arch: string = process.arch): string | null {
  const wantArm = arch === 'arm64'
  return assets.find((a) => a.name.endsWith('.dmg') && a.name.includes('-arm64.') === wantArm)?.browser_download_url ?? null
}

export async function checkUpdate(currentVersion: string): Promise<UpdateCheck> {
  const response = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`GitHub API answered ${response.status}`)
  const releases = (await response.json()) as { tag_name: string; html_url: string; draft: boolean; assets: Asset[] }[]
  const release = releases.find((r) => !r.draft && r.tag_name.startsWith(TAG_PREFIX))
  if (!release) return { current: currentVersion, latest: null, tag: null, url: null, dmgUrl: null, hasUpdate: false }
  const latest = release.tag_name.slice(TAG_PREFIX.length)
  return {
    current: currentVersion,
    latest,
    tag: release.tag_name,
    url: release.html_url,
    dmgUrl: pickDmg(release.assets),
    hasUpdate: compareVersion(latest, currentVersion) > 0,
  }
}

// The folder electron-updater reads latest.yml from. The monorepo has many products, so "latest release" is not ours.
export function releaseDownloadUrl(tag: string): string {
  return `https://github.com/${REPO}/releases/download/${tag}/`
}

export async function downloadDmg(dmgUrl: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX))
  try {
    const response = await fetch(dmgUrl)
    if (!response.ok) throw new Error(`dmg download failed: ${response.status}`)
    if (!response.body) throw new Error('dmg response has no body')
    const dmgPath = path.join(dir, path.basename(new URL(dmgUrl).pathname))
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), createWriteStream(dmgPath))
    return dmgPath
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true })
    throw error
  }
}

export async function cleanupTempDirs(): Promise<void> {
  const tmp = os.tmpdir()
  const names = await fs.readdir(tmp)
  await Promise.all(names.filter((n) => n.startsWith(TEMP_PREFIX)).map((n) => fs.rm(path.join(tmp, n), { recursive: true, force: true })))
}

// Waits for the app to exit, swaps the bundle, restores the old one on failure, relaunches.
export const SWAP_SCRIPT = `#!/bin/bash
set -u
APP="$1"; DMG="$2"; PID="$3"
WORK=$(dirname "$DMG")
MOUNT=""

cleanup() {
  if [ -n "$MOUNT" ]; then
    hdiutil detach "$MOUNT" -quiet 2>/dev/null || hdiutil detach "$MOUNT" -force -quiet 2>/dev/null
    rmdir "$MOUNT" 2>/dev/null
  fi
  # This script lives in WORK too; it keeps running after its file is removed.
  rm -rf "$WORK"
}
trap cleanup EXIT

while kill -0 "$PID" 2>/dev/null; do sleep 0.3; done

MOUNT=$(mktemp -d) || exit 1
hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$MOUNT" || exit 1
NEW=$(find "$MOUNT" -maxdepth 1 -name '*.app' | head -1)
[ -n "$NEW" ] || exit 1

rm -rf "$APP.old"
mv "$APP" "$APP.old" || exit 1
if ditto "$NEW" "$APP"; then
  rm -rf "$APP.old"
else
  rm -rf "$APP"
  mv "$APP.old" "$APP"
  exit 1
fi

xattr -cr "$APP"
open "$APP"
`

// The caller must app.quit() right after; the script waits for this pid to exit.
export async function spawnSwap(appPath: string, dmgPath: string): Promise<void> {
  const scriptPath = path.join(path.dirname(dmgPath), 'swap.sh')
  await fs.writeFile(scriptPath, SWAP_SCRIPT, { mode: 0o755 })
  spawn('/bin/bash', [scriptPath, appPath, dmgPath, String(process.pid)], { detached: true, stdio: 'ignore' }).unref()
}
