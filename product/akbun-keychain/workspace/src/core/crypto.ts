import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export interface KdfParams {
  name: 'scrypt'
  N: number
  r: number
  p: number
  salt: string
}

export interface Box {
  nonce: string
  ciphertext: string
}

export const DEFAULT_KDF_N = 2 ** 17
export const MIN_KDF_N = 2 ** 15
const KEY_BYTES = 32
const NONCE_BYTES = 12
const TAG_BYTES = 16
const SCRYPT_MAXMEM = 256 * 1024 * 1024

export function newKdfParams(N: number = DEFAULT_KDF_N): KdfParams {
  return { name: 'scrypt', N, r: 8, p: 1, salt: randomBytes(16).toString('base64') }
}

export function newDataKey(): Buffer {
  return randomBytes(KEY_BYTES)
}

export function deriveKek(password: string, kdf: KdfParams): Buffer {
  return scryptSync(password.normalize('NFC'), Buffer.from(kdf.salt, 'base64'), KEY_BYTES, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    maxmem: SCRYPT_MAXMEM,
  })
}

export function seal(key: Buffer, plaintext: Buffer, aad: string): Box {
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const body = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
  return { nonce: nonce.toString('base64'), ciphertext: body.toString('base64') }
}

// Returns undefined when authentication fails, so callers decide which error that means.
export function open(key: Buffer, box: Box, aad: string): Buffer | undefined {
  const nonce = Buffer.from(box.nonce, 'base64')
  const body = Buffer.from(box.ciphertext, 'base64')
  if (nonce.length !== NONCE_BYTES || body.length < TAG_BYTES) return undefined
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce)
    decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(body.subarray(body.length - TAG_BYTES))
    return Buffer.concat([decipher.update(body.subarray(0, body.length - TAG_BYTES)), decipher.final()])
  } catch {
    return undefined
  }
}

export interface Subkeys {
  entryKey: Buffer
  macKey: Buffer
}

export function deriveSubkeys(dataKey: Buffer, vaultId: string): Subkeys {
  const subkey = (info: string) => Buffer.from(hkdfSync('sha256', dataKey, vaultId, info, KEY_BYTES))
  return { entryKey: subkey('akbun-keychain/entry'), macKey: subkey('akbun-keychain/mac') }
}

export function mac(key: Buffer, data: string): string {
  return createHmac('sha256', key).update(data, 'utf8').digest('base64')
}

export function macMatches(key: Buffer, data: string, expected: string): boolean {
  const actual = Buffer.from(mac(key, data), 'base64')
  const given = Buffer.from(expected, 'base64')
  return actual.length === given.length && timingSafeEqual(actual, given)
}
