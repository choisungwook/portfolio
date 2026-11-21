import { X509Certificate } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import * as tls from 'node:tls'
import type { Config } from '../config.ts'

// A network with a TLS inspection device (a security appliance that decrypts and re-signs HTTPS) needs its root
// certificate trusted, or indexer model calls fail with a certificate error. An imported PEM is stored as
// $AIMEMORY_HOME/aimemory-ca-bundle.pem and takes precedence over config.caBundle. It reaches:
// - child processes (e.g. detached indexer, external CLIs) via NODE_EXTRA_CA_CERTS and AWS_CA_BUNDLE,
// - this process's own HTTPS requests via tls.setDefaultCACertificates (Node 23.8+ and Bun).
export const CA_FILE_NAME = 'aimemory-ca-bundle.pem'
const META_KEY = 'ca_bundle_saved'
const MAX_PEM_BYTES = 1_000_000
const BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g

export interface CertInfo {
  subject: string
  issuer: string
  valid_to: string
  fingerprint256: string
}

export interface CaBundleInfo {
  path: string | null
  source: 'saved' | 'config' | null
  certs: CertInfo[]
  // Reserved slot for future certificate pinning enforcement (out of scope for now).
  pinnedFingerprints: string[]
  error?: string
}

const caFile = (config: Config) => join(config.home, CA_FILE_NAME)

function getMeta(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row ? row.value : null
}

function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value)
}

// Parse every X.509 certificate in a PEM text, or return a human-readable error string.
export function parseBundle(text: string): CertInfo[] | string {
  const blocks = text.match(BLOCK) ?? []
  if (blocks.length === 0) return 'no certificate found: the file must be PEM (-----BEGIN CERTIFICATE-----)'
  try {
    return blocks.map((pem) => {
      const cert = new X509Certificate(pem)
      return {
        subject: cert.subject.replace(/\n/g, ', '),
        issuer: cert.issuer.replace(/\n/g, ', '),
        valid_to: cert.validTo,
        fingerprint256: cert.fingerprint256,
      }
    })
  } catch (error) {
    return `a certificate could not be read: ${error instanceof Error ? error.message : String(error)}`
  }
}

// Preserve the config file's original caBundle so clearing an imported bundle restores it.
const fileValue = new WeakMap<Config, string | undefined>()
let defaultCas: string[] | null = null

export function applyCaBundle(db: DatabaseSync, config: Config): void {
  if (!fileValue.has(config)) fileValue.set(config, config.caBundle)
  const saved = getMeta(db, META_KEY) === '1' && existsSync(caFile(config)) ? caFile(config) : undefined
  config.caBundle = saved ?? fileValue.get(config)
  if (config.caBundle) {
    process.env.NODE_EXTRA_CA_CERTS = config.caBundle
    process.env.AWS_CA_BUNDLE = config.caBundle
  } else {
    for (const name of ['NODE_EXTRA_CA_CERTS', 'AWS_CA_BUNDLE']) {
      if (process.env[name] === caFile(config)) delete process.env[name]
    }
  }
  const setDefaults = (tls as { setDefaultCACertificates?: (certs: string[]) => void }).setDefaultCACertificates
  const getCas = (tls as { getCACertificates?: (kind: string) => string[] }).getCACertificates
  if (!setDefaults || !getCas) return
  defaultCas ??= getCas('default')
  try {
    const extra = config.caBundle && existsSync(config.caBundle)
      ? readFileSync(config.caBundle, 'utf8').match(BLOCK) ?? []
      : []
    setDefaults([...defaultCas, ...extra])
  } catch { /* unreadable caBundle or runtime refusal keeps defaults; caBundleInfo reports file errors */ }
}

export function caBundleInfo(db: DatabaseSync, config: Config): CaBundleInfo {
  applyCaBundle(db, config)
  const pinnedFingerprints = config.connection?.pinnedFingerprints ?? []
  if (!config.caBundle) return { path: null, source: null, certs: [], pinnedFingerprints }
  const source = config.caBundle === caFile(config) ? 'saved' : 'config'
  try {
    const parsed = parseBundle(readFileSync(config.caBundle, 'utf8'))
    return typeof parsed === 'string'
      ? { path: config.caBundle, source, certs: [], pinnedFingerprints, error: parsed }
      : { path: config.caBundle, source, certs: parsed, pinnedFingerprints }
  } catch (error) {
    return {
      path: config.caBundle,
      source,
      certs: [],
      pinnedFingerprints,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function saveCaBundle(db: DatabaseSync, config: Config, pem: string): CaBundleInfo | string {
  if (Buffer.byteLength(pem, 'utf8') > MAX_PEM_BYTES) {
    return 'the file is larger than 1 MB; a CA bundle is a few KB'
  }
  const parsed = parseBundle(pem)
  if (typeof parsed === 'string') return parsed
  mkdirSync(config.home, { recursive: true, mode: 0o700 })
  // Keep only certificate blocks so a PEM containing a private key never writes the key to disk.
  writeFileSync(caFile(config), `${(pem.match(BLOCK) ?? []).join('\n')}\n`, { mode: 0o644 })
  setMeta(db, META_KEY, '1')
  return caBundleInfo(db, config)
}

export function clearCaBundle(db: DatabaseSync, config: Config): CaBundleInfo {
  db.prepare('DELETE FROM meta WHERE key = ?').run(META_KEY)
  rmSync(caFile(config), { force: true })
  return caBundleInfo(db, config)
}
