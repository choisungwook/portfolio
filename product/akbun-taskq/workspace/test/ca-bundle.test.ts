import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CA_FILE_NAME, caBundleInfo, clearCaBundle, parseBundle, saveCaBundle } from '../src/ca-bundle.ts'
import { setup } from './helpers.ts'

test('an imported CA bundle is checked, kept in TASKQ_HOME, applied, and cleared back to none', () => {
  const env = setup()
  const dir = mkdtempSync(join(tmpdir(), 'taskq-ca-'))
  const before = { node: process.env.NODE_EXTRA_CA_CERTS, aws: process.env.AWS_CA_BUNDLE }
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=Inspection Root'], { stdio: 'ignore' })
    const pem = readFileSync(join(dir, 'c.pem'), 'utf8')
    assert.match(String(parseBundle('not a certificate')), /no certificate/)
    assert.match(String(saveCaBundle(env.db, env.config, 'hello')), /no certificate/)
    const saved = saveCaBundle(env.db, env.config, pem)
    assert.ok(typeof saved !== 'string')
    assert.equal(saved.source, 'saved')
    assert.match(saved.certs[0].subject, /Inspection Root/)
    assert.equal(env.config.caBundle, join(env.home, CA_FILE_NAME))
    assert.equal(process.env.NODE_EXTRA_CA_CERTS, env.config.caBundle, 'children get it')
    const cleared = clearCaBundle(env.db, env.config)
    assert.equal(cleared.path, before.node === undefined ? null : cleared.path)
    assert.equal(existsSync(join(env.home, CA_FILE_NAME)), false)
    assert.equal(caBundleInfo(env.db, env.config).source, null)
  } finally {
    if (before.node === undefined) delete process.env.NODE_EXTRA_CA_CERTS
    else process.env.NODE_EXTRA_CA_CERTS = before.node
    if (before.aws === undefined) delete process.env.AWS_CA_BUNDLE
    else process.env.AWS_CA_BUNDLE = before.aws
    env.cleanup()
  }
})
