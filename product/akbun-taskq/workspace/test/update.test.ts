import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assetName, checkUpdate, installUpdate, newer } from '../src/update.ts'
import pkg from '../package.json' with { type: 'json' }

// Settings > Update against a fake GitHub: no network call runs here.

function fakeGitHub(version: string, archive: Buffer | null, asset = assetName() ?? 'taskq-darwin-arm64.tar.gz'): typeof fetch {
  return (async (input: string | URL) => {
    const url = String(input)
    if (url.startsWith('https://api.github.com/')) {
      return Response.json([
        { tag_name: 'akbun-other-v9.9.9', html_url: 'x', draft: false, prerelease: false, assets: [] },
        { tag_name: `akbun-taskq-v${version}`, html_url: 'https://github.com/r/releases/1', draft: false, prerelease: false, assets: [{ name: asset, browser_download_url: `https://github.com/r/releases/download/${asset}` }] },
      ])
    }
    return archive ? new Response(new Uint8Array(archive)) : new Response('missing', { status: 404 })
  }) as typeof fetch
}

describe('update from Settings', () => {
  test('versions compare as numbers', () => {
    assert.equal(newer('0.16.1', '0.17.0'), true)
    assert.equal(newer('0.16.10', '0.16.9'), false)
    assert.equal(newer('1.0.0', '1.0.0'), false)
  })

  test('[critical] the check finds the newest akbun-taskq release; a checkout cannot install', async () => {
    const ahead = await checkUpdate(fakeGitHub('99.0.0', null), false)
    assert.deepEqual([ahead.current, ahead.latest, ahead.update_available, ahead.can_install], [pkg.version, '99.0.0', true, false])
    assert.match(ahead.reason ?? '', /git pull/)
    const same = await checkUpdate(fakeGitHub(pkg.version, null), true)
    assert.deepEqual([same.update_available, same.can_install], [false, false])
  })

  test('[critical] install unpacks the release build and swaps it over the running binary', { skip: !assetName() }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'taskq-update-test-'))
    try {
      writeFileSync(join(dir, 'taskq'), 'new build')
      execFileSync('tar', ['-czf', join(dir, 'build.tar.gz'), '-C', dir, 'taskq'])
      const target = join(dir, 'installed-taskq')
      writeFileSync(target, 'old build')
      const version = await installUpdate(fakeGitHub('99.0.0', readFileSync(join(dir, 'build.tar.gz'))), target, true)
      assert.equal(version, '99.0.0')
      assert.equal(readFileSync(target, 'utf8'), 'new build')
      writeFileSync(target, 'old build')
      await assert.rejects(installUpdate(fakeGitHub('99.0.0', null), target, true), /HTTP 404/)
      assert.equal(readFileSync(target, 'utf8'), 'old build', 'a failed download leaves the binary as it was')
      await assert.rejects(installUpdate(fakeGitHub(pkg.version, null), target, true), /already the latest/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
