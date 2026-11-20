import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installSourceOf, type CatalogPlugin } from '../src/team/plugin-catalog.ts'
import { deleteInstalled, installedByTaskq, installPlugin } from '../src/team/plugin-install.ts'
import { listEntries, registerEntry } from '../src/db/bot-registry.ts'
import { setup } from './helpers.ts'

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim()

// A repository with two plugins: tools/ has its own plugin.json, notes/ (strict: false) has none.
function marketplaceRepo(version: string): { url: string; sha: string } {
  const dir = mkdtempSync(join(tmpdir(), 'taskq-market-'))
  git(dir, 'init', '-q')
  mkdirSync(join(dir, 'plugins', 'tools', '.claude-plugin'), { recursive: true })
  writeFileSync(join(dir, 'plugins', 'tools', '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'tools', description: `tools ${version}` }))
  mkdirSync(join(dir, 'plugins', 'notes', 'skills', 'note'), { recursive: true })
  writeFileSync(join(dir, 'plugins', 'notes', 'skills', 'note', 'SKILL.md'), '---\nname: note\ndescription: take notes\n---\n')
  writeFileSync(join(dir, 'unrelated.txt'), 'not part of any plugin')
  git(dir, 'add', '.')
  git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', version)
  return { url: dir, sha: git(dir, 'rev-parse', 'HEAD') }
}

const entry = (name: string, url: string, path: string, sha: string | null): CatalogPlugin => ({
  name, description: '', anthropic: true, source: url, homepage: null,
  install: { url, path, ref: null, sha }, manifest: { name, description: `${name} from the marketplace` },
})

describe('marketplace plugin install', () => {
  test('a catalog source becomes a git url, folder and pinned commit; anything but https is refused', () => {
    assert.deepEqual(installSourceOf('./plugins/agent-sdk-dev'), { url: 'https://github.com/anthropics/claude-plugins-official.git', path: 'plugins/agent-sdk-dev', ref: null, sha: null })
    assert.deepEqual(installSourceOf({ source: 'git-subdir', url: 'https://github.com/a/b.git', path: 'plugins/x', ref: 'v1', sha: 'faf5305' }), { url: 'https://github.com/a/b.git', path: 'plugins/x', ref: 'v1', sha: 'faf5305' })
    assert.equal(installSourceOf({ source: 'github', repo: 'a/b' })?.url, 'https://github.com/a/b.git')
    assert.equal(installSourceOf({ source: 'url', url: 'git@github.com:a/b.git' }), null)
    assert.equal(installSourceOf({ source: 'git-subdir', url: 'https://github.com/a/b.git', path: '../escape' }), null)
    assert.equal(installSourceOf({ source: 'command', command: 'x' }), null)
    assert.equal(installSourceOf('../outside'), null, 'a relative source cannot step out of the checkout either')
    assert.equal(installSourceOf('./plugins/x/')?.path, 'plugins/x')
    assert.equal(installSourceOf({ source: 'url', url: 'https://github.com/a/b.git', sha: '--upload-pack=touch /tmp/x' }), null)
    assert.equal(installSourceOf({ source: 'url', url: 'https://github.com/a/b.git', ref: '-c' }), null)
  })

  test('install fetches only the plugin folder at the listed commit, registers it, and reinstall replaces it', async () => {
    const env = setup()
    const repo = marketplaceRepo('v1')
    const first = await installPlugin(env.db, env.home, entry('tools', repo.url, 'plugins/tools', repo.sha))
    assert.equal(first.replaced, false)
    assert.equal(first.path, join(env.home, 'plugins', 'tools', 'plugins', 'tools'))
    assert.ok(installedByTaskq(env.home, first.path))
    assert.equal(existsSync(join(env.home, 'plugins', 'tools', 'unrelated.txt')), false, 'sparse checkout leaves other files out')
    assert.deepEqual(listEntries(env.db, 'plugin').map((e) => [e.name, e.description, e.ok]), [['tools', 'tools v1', true]])

    const again = await installPlugin(env.db, env.home, entry('tools', repo.url, 'plugins/tools', repo.sha))
    assert.equal(again.replaced, true)
    assert.equal(listEntries(env.db, 'plugin').length, 1)

    deleteInstalled(env.home, 'tools', again.path)
    assert.equal(existsSync(join(env.home, 'plugins', 'tools')), false)
  })

  test('a strict: false entry gets its manifest from the catalog; a plugin registered by path is not replaced', async () => {
    const env = setup()
    const repo = marketplaceRepo('v1')
    const renamed = await installPlugin(env.db, env.home, entry('acme-tools', repo.url, 'plugins/tools', repo.sha))
    assert.equal(renamed.name, 'acme-tools', 'registered under the marketplace name, not the manifest name')
    const notes = await installPlugin(env.db, env.home, entry('notes', repo.url, 'plugins/notes', null))
    const manifest = JSON.parse(readFileSync(join(notes.path, '.claude-plugin', 'plugin.json'), 'utf8'))
    assert.equal(manifest.description, 'notes from the marketplace')

    const own = join(env.home, 'own-tools')
    mkdirSync(join(own, '.claude-plugin'), { recursive: true })
    writeFileSync(join(own, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'tools' }))
    registerEntry(env.db, env.home, 'plugin', own)
    await assert.rejects(installPlugin(env.db, env.home, entry('tools', repo.url, 'plugins/tools', repo.sha)), /already registered/)
    deleteInstalled(env.home, 'tools', own)
    assert.ok(existsSync(own), 'a folder registered by path is never deleted')
  })

  test('two installs of one name at once: the second is refused instead of racing', async () => {
    const env = setup()
    const repo = marketplaceRepo('v1')
    const results = await Promise.allSettled([
      installPlugin(env.db, env.home, entry('tools', repo.url, 'plugins/tools', repo.sha)),
      installPlugin(env.db, env.home, entry('tools', repo.url, 'plugins/tools', repo.sha)),
    ])
    assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected'])
    assert.match(String((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason), /already being installed/)
  })

  test('a failed fetch leaves nothing behind', async () => {
    const env = setup()
    await assert.rejects(installPlugin(env.db, env.home, entry('tools', join(env.home, 'no-such-repo'), 'plugins/tools', null)), /git fetch failed/)
    assert.deepEqual(execFileSync('ls', ['-A', join(env.home, 'plugins')]).toString().trim(), '')
    assert.equal(listEntries(env.db, 'plugin').length, 0)
  })
})
