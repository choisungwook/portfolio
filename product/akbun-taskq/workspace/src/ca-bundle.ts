import { X509Certificate } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as tls from 'node:tls'
import type { Config } from './config.ts'
import type { Db } from './db/open.ts'
import { getMeta, setMeta } from './db/meta.ts'

// A network with a TLS inspection device (a security appliance that decrypts and re-signs HTTPS) needs its root
// certificate trusted, or every model call fails with a certificate error. Settings > Connections imports that PEM
// file once: it is kept as TASKQ_HOME/taskq-ca-bundle.pem (a bot touching it stops its turn, like taskq.config.json)
// and becomes config.caBundle, which overrides the config file's caBundle. It reaches:
// - Claude Code sessions: NODE_EXTRA_CA_CERTS and AWS_CA_BUNDLE in their environment (buildEnv),
// - every other child (kiro-cli, codex, the aws CLI a bot runs): the same two variables in taskq's own environment,
// - taskq's own requests (the update check, OpenAI bots that run in this process): the process's default CA list.
export const CA_FILE_NAME = 'taskq-ca-bundle.pem'
const META = 'ca_bundle_saved'

export interface CertInfo { subject: string; issuer: string; valid_to: string }
export interface CaBundleInfo { path: string | null; source: 'saved' | 'config' | null; certs: CertInfo[]; error?: string }

const caFile = (config: Config) => join(config.home, CA_FILE_NAME)
const BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g

// Every certificate in a PEM text, or why it is not one.
export function parseBundle(text: string): CertInfo[] | string {
  const blocks = text.match(BLOCK) ?? []
  if (blocks.length === 0) return 'no certificate found: the file must be PEM (-----BEGIN CERTIFICATE-----)'
  try {
    return blocks.map((pem) => {
      const cert = new X509Certificate(pem)
      return { subject: cert.subject.replace(/\n/g, ', '), issuer: cert.issuer.replace(/\n/g, ', '), valid_to: cert.validTo }
    })
  } catch (error) {
    return `a certificate could not be read: ${error instanceof Error ? error.message : String(error)}`
  }
}

// The config file's caBundle, kept from the first apply so Clear goes back to it.
const fileValue = new WeakMap<Config, string | undefined>()
let defaultCas: string[] | null = null

// At startup and after a change: the imported file wins over the config file's caBundle, and the result is applied to
// child processes and to this process.
export function applyCaBundle(db: Db, config: Config): void {
  if (!fileValue.has(config)) fileValue.set(config, config.caBundle)
  const saved = getMeta(db, META) === '1' && existsSync(caFile(config)) ? caFile(config) : undefined
  config.caBundle = saved ?? fileValue.get(config)
  if (config.caBundle) {
    process.env.NODE_EXTRA_CA_CERTS = config.caBundle
    process.env.AWS_CA_BUNDLE = config.caBundle
  } else {
    for (const name of ['NODE_EXTRA_CA_CERTS', 'AWS_CA_BUNDLE']) if (process.env[name] === caFile(config)) delete process.env[name]
  }
  // Node 23.8+ and Bun can change the default CAs of a running process; without it this process trusts the bundle from
  // its next start (NODE_EXTRA_CA_CERTS is read at start).
  const setDefaults = (tls as { setDefaultCACertificates?: (certs: string[]) => void }).setDefaultCACertificates
  const getCas = (tls as { getCACertificates?: (kind: string) => string[] }).getCACertificates
  if (!setDefaults || !getCas) return
  defaultCas ??= getCas('default')
  const extra = config.caBundle && existsSync(config.caBundle) ? readFileSync(config.caBundle, 'utf8').match(BLOCK) ?? [] : []
  try {
    setDefaults([...defaultCas, ...extra])
  } catch { /* a runtime that refuses keeps its defaults */ }
}

export function caBundleInfo(db: Db, config: Config): CaBundleInfo {
  applyCaBundle(db, config)
  if (!config.caBundle) return { path: null, source: null, certs: [] }
  const source = config.caBundle === caFile(config) ? 'saved' : 'config'
  try {
    const parsed = parseBundle(readFileSync(config.caBundle, 'utf8'))
    return typeof parsed === 'string' ? { path: config.caBundle, source, certs: [], error: parsed } : { path: config.caBundle, source, certs: parsed }
  } catch (error) {
    return { path: config.caBundle, source, certs: [], error: error instanceof Error ? error.message : String(error) }
  }
}

// Checks the PEM, keeps it and applies it; returns why when it is not a certificate bundle.
export function saveCaBundle(db: Db, config: Config, pem: string): CaBundleInfo | string {
  if (pem.length > 1_000_000) return 'the file is larger than 1 MB; a CA bundle is a few KB'
  const parsed = parseBundle(pem)
  if (typeof parsed === 'string') return parsed
  // Only the certificate blocks are kept: a PEM that also holds a private key must not leave the key readable here.
  writeFileSync(caFile(config), `${(pem.match(BLOCK) ?? []).join('\n')}\n`, { mode: 0o644 })
  setMeta(db, META, '1')
  return caBundleInfo(db, config)
}

// Back to the config file's caBundle (or none). Variables set in this process stay until it restarts.
export function clearCaBundle(db: Db, config: Config): CaBundleInfo {
  db.prepare('DELETE FROM meta WHERE key = ?').run(META)
  rmSync(caFile(config), { force: true })
  return caBundleInfo(db, config)
}
