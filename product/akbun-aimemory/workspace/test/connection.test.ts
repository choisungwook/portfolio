import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as tls from 'node:tls'
import { loadConfig } from '../src/config.ts'
import { CA_FILE_NAME, caBundleInfo, clearCaBundle, parseBundle, saveCaBundle } from '../src/connection/ca-bundle.ts'
import { startServer } from '../src/server.ts'
import { openStore } from '../src/store.ts'

function generateCertPem(cn: string): { certPem: string; keyPem: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aimem-cert-'))
  const keyPath = join(dir, 'k.pem')
  const certPath = join(dir, 'c.pem')
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath,
    '-days', '2', '-subj', `/CN=${cn}`,
  ], { stdio: 'ignore' })
  return { certPem: readFileSync(certPath, 'utf8'), keyPem: readFileSync(keyPath, 'utf8'), path: certPath }
}

test('[critical] PEM parsing succeeds on valid certs, rejects invalid PEM, and applies to NODE_EXTRA_CA_CERTS and process CAs', () => {
  const before = { node: process.env.NODE_EXTRA_CA_CERTS, aws: process.env.AWS_CA_BUNDLE }
  delete process.env.NODE_EXTRA_CA_CERTS
  delete process.env.AWS_CA_BUNDLE

  const home = mkdtempSync(join(tmpdir(), 'aimem-ca-'))
  const config = loadConfig(home, false)
  const store = openStore(config)
  try {
    assert.match(String(parseBundle('not a certificate')), /no certificate/)
    assert.match(
      String(parseBundle('-----BEGIN CERTIFICATE-----\nnot-base64-cert\n-----END CERTIFICATE-----')),
      /could not be read/,
    )
    assert.match(String(saveCaBundle(store.db, config, 'invalid pem')), /no certificate/)
    assert.equal(existsSync(join(home, CA_FILE_NAME)), false)

    const { certPem, keyPem } = generateCertPem('Aimemory Inspection Root')
    const parsed = parseBundle(certPem)
    assert.ok(Array.isArray(parsed))
    assert.equal(parsed.length, 1)
    assert.match(parsed[0].subject, /Aimemory Inspection Root/)
    assert.ok(parsed[0].fingerprint256.length > 0)

    // Combining a private key with the cert must only persist the certificate block.
    const saved = saveCaBundle(store.db, config, `${keyPem}\n${certPem}`)
    assert.ok(typeof saved !== 'string')
    assert.equal(saved.source, 'saved')
    assert.equal(saved.path, join(home, CA_FILE_NAME))
    assert.match(saved.certs[0].subject, /Aimemory Inspection Root/)
    assert.doesNotMatch(readFileSync(join(home, CA_FILE_NAME), 'utf8'), /PRIVATE KEY/)

    assert.equal(process.env.NODE_EXTRA_CA_CERTS, join(home, CA_FILE_NAME))
    const getCas = (tls as { getCACertificates?: (kind: string) => string[] }).getCACertificates
    if (getCas) {
      const current = getCas('default').join('\n')
      assert.ok(current.includes(certPem.trim().split('\n')[1]), 'process default CAs include imported cert')
    }

    const cleared = clearCaBundle(store.db, config)
    assert.equal(cleared.path, null)
    assert.equal(cleared.source, null)
    assert.equal(existsSync(join(home, CA_FILE_NAME)), false)
    assert.equal(process.env.NODE_EXTRA_CA_CERTS, undefined)
  } finally {
    store.db.close()
    if (before.node === undefined) delete process.env.NODE_EXTRA_CA_CERTS
    else process.env.NODE_EXTRA_CA_CERTS = before.node
    if (before.aws === undefined) delete process.env.AWS_CA_BUNDLE
    else process.env.AWS_CA_BUNDLE = before.aws
  }
})

test('clearing a saved CA bundle falls back to config.caBundle', () => {
  const before = { node: process.env.NODE_EXTRA_CA_CERTS, aws: process.env.AWS_CA_BUNDLE }
  const home = mkdtempSync(join(tmpdir(), 'aimem-ca-cfg-'))
  const cfgCert = generateCertPem('Config Root')
  const savedCert = generateCertPem('Saved Root')
  const config = { ...loadConfig(home, false), caBundle: cfgCert.path }
  const store = openStore(config)
  try {
    const initial = caBundleInfo(store.db, config)
    assert.equal(initial.source, 'config')
    assert.match(initial.certs[0].subject, /Config Root/)
    assert.equal(process.env.NODE_EXTRA_CA_CERTS, cfgCert.path)

    const saved = saveCaBundle(store.db, config, savedCert.certPem)
    assert.ok(typeof saved !== 'string')
    assert.equal(saved.source, 'saved')
    assert.match(saved.certs[0].subject, /Saved Root/)

    const cleared = clearCaBundle(store.db, config)
    assert.equal(cleared.source, 'config')
    assert.equal(cleared.path, cfgCert.path)
    assert.match(cleared.certs[0].subject, /Config Root/)
  } finally {
    store.db.close()
    if (before.node === undefined) delete process.env.NODE_EXTRA_CA_CERTS
    else process.env.NODE_EXTRA_CA_CERTS = before.node
    if (before.aws === undefined) delete process.env.AWS_CA_BUNDLE
    else process.env.AWS_CA_BUNDLE = before.aws
  }
})

test('HTTP /api/ca-bundle validates, imports, lists, and clears CA bundles', async () => {
  const before = { node: process.env.NODE_EXTRA_CA_CERTS, aws: process.env.AWS_CA_BUNDLE }
  const home = mkdtempSync(join(tmpdir(), 'aimem-ca-http-'))
  const store = openStore(loadConfig(home, false))
  const srv = await startServer(store, 0)
  const parsedUrl = new URL(srv.url)
  const token = parsedUrl.searchParams.get('token') ?? ''
  const base = parsedUrl.origin
  try {
    const bad = await fetch(`${base}/api/ca-bundle`, {
      method: 'PUT',
      headers: { 'x-aimem-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ pem: 'not a cert' }),
    })
    assert.equal(bad.status, 400)
    const badJson = await bad.json() as { error: string }
    assert.match(badJson.error, /no certificate/)

    const { certPem } = generateCertPem('HTTP Imported Root')
    const ok = await fetch(`${base}/api/ca-bundle`, {
      method: 'PUT',
      headers: { 'x-aimem-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ pem: certPem }),
    })
    assert.equal(ok.status, 200)
    const okJson = await ok.json() as { source: string; certs: { subject: string }[] }
    assert.equal(okJson.source, 'saved')
    assert.match(okJson.certs[0].subject, /HTTP Imported Root/)

    const getRes = await fetch(`${base}/api/ca-bundle`, { headers: { 'x-aimem-token': token } })
    assert.equal(getRes.status, 200)
    const getJson = await getRes.json() as { certs: { subject: string }[] }
    assert.equal(getJson.certs.length, 1)

    const delRes = await fetch(`${base}/api/ca-bundle`, { method: 'DELETE', headers: { 'x-aimem-token': token } })
    assert.equal(delRes.status, 200)
    const delJson = await delRes.json() as { path: string | null }
    assert.equal(delJson.path, null)
  } finally {
    await srv.close()
    store.db.close()
    if (before.node === undefined) delete process.env.NODE_EXTRA_CA_CERTS
    else process.env.NODE_EXTRA_CA_CERTS = before.node
    if (before.aws === undefined) delete process.env.AWS_CA_BUNDLE
    else process.env.AWS_CA_BUNDLE = before.aws
  }
})
