import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const PASSWORD = 'correct horse battery staple'
export const TEST_KDF_N = 2 ** 15
export const FIXTURES = join(import.meta.dirname, 'fixtures')

const homes: string[] = []
process.on('exit', () => {
  for (const dir of homes) rmSync(dir, { recursive: true, force: true })
})

// Each test file runs in its own process, so pointing the home at a temp directory per test is safe.
// Removal waits for process exit because node:test runs an after() registered inside a hook when that hook ends.
export function useTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'akbun-keychain-test-'))
  process.env.AKBUN_KEYCHAIN_HOME = dir
  homes.push(dir)
  return dir
}

export function encodings(secret: string): string[] {
  const bytes = Buffer.from(secret, 'utf8')
  return [secret, bytes.toString('base64'), bytes.toString('base64url'), bytes.toString('hex'), bytes.toString('hex').toUpperCase()]
}
