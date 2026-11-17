import { StringDecoder } from 'node:string_decoder'

export interface Secret {
  name: string
  value: string
}

// Encoded forms collide with ordinary text for short values, so those are masked in plain form only.
const ENCODED_MIN_LENGTH = 8

function forms(value: string): string[] {
  const bytes = Buffer.from(value, 'utf8')
  const all = [value]
  if (value.length >= ENCODED_MIN_LENGTH) {
    all.push(
      bytes.toString('base64'),
      bytes.toString('base64').replace(/=+$/, ''),
      bytes.toString('base64url'),
      bytes.toString('hex'),
      bytes.toString('hex').toUpperCase(),
      encodeURIComponent(value),
    )
  }
  return [...new Set(all)].filter((form) => form.length > 0)
}

interface Pattern {
  text: string
  marker: string
}

export interface Masker {
  push(chunk: Buffer | string): string
  end(): string
}

// Replaces every form of every secret in a stream. The last (longest form - 1) characters are held back between
// chunks, so a value split across two chunks is still found.
export function createMasker(secrets: Secret[]): Masker {
  const patterns: Pattern[] = secrets
    .flatMap((secret) => forms(secret.value).map((text) => ({ text, marker: `[masked:${secret.name}]` })))
    .sort((a, b) => b.text.length - a.text.length)
  const hold = Math.max(0, ...patterns.map((pattern) => pattern.text.length)) - 1
  const decoder = new StringDecoder('utf8')
  let carry = ''

  function replaceAll(text: string): string {
    let result = text
    for (const pattern of patterns) result = result.split(pattern.text).join(pattern.marker)
    return result
  }

  // Emits everything except a tail that could still be the start of a secret.
  function emit(text: string, final: boolean): string {
    if (final || hold <= 0) {
      carry = ''
      return replaceAll(text)
    }
    let cut = Math.max(0, text.length - hold)
    // Never cut inside a match: extend the emitted part past any pattern that starts before the cut and crosses it.
    for (const pattern of patterns) {
      let index = text.indexOf(pattern.text)
      while (index !== -1 && index < cut) {
        if (index + pattern.text.length > cut) cut = index + pattern.text.length
        index = text.indexOf(pattern.text, index + 1)
      }
    }
    carry = text.slice(cut)
    return replaceAll(text.slice(0, cut))
  }

  return {
    push(chunk) {
      const text = carry + (typeof chunk === 'string' ? chunk : decoder.write(chunk))
      return emit(text, false)
    },
    end() {
      return emit(carry + decoder.end(), true)
    },
  }
}
