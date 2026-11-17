import { readSync } from 'node:fs'
import { KeychainError } from '../core/errors.ts'

export interface Io {
  stdinIsTty: boolean
  out: (text: string) => void
  err: (text: string) => void
  readStdin: () => string
  promptHidden: (question: string) => string
}

// Reads all of stdin synchronously. Works for pipes and files on every OS without an event loop round trip.
export function readAllStdin(): string {
  const chunks: Buffer[] = []
  const buffer = Buffer.alloc(65536)
  for (;;) {
    let read: number
    try {
      read = readSync(0, buffer, 0, buffer.length, null)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EAGAIN') continue
      if (code === 'EOF') break
      throw error
    }
    if (read === 0) break
    chunks.push(Buffer.from(buffer.subarray(0, read)))
  }
  return Buffer.concat(chunks).toString('utf8')
}

// Hidden input from the terminal: raw mode, no echo, one line. Ctrl+C aborts.
export function promptHiddenTty(question: string): string {
  if (!process.stdin.isTTY) throw new KeychainError('DENIED', 'no terminal to ask for a secret: use --password-stdin, or run it in a terminal')
  process.stderr.write(question)
  process.stdin.setRawMode(true)
  const bytes: number[] = []
  const one = Buffer.alloc(1)
  try {
    for (;;) {
      let read: number
      try {
        read = readSync(0, one, 0, 1, null)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EAGAIN') continue
        throw error
      }
      if (read === 0) break
      const byte = one[0]
      if (byte === 3) throw new KeychainError('USAGE', 'cancelled')
      if (byte === 13 || byte === 10) break
      if (byte === 127 || byte === 8) {
        bytes.pop()
        continue
      }
      bytes.push(byte)
    }
  } finally {
    process.stdin.setRawMode(false)
    process.stderr.write('\n')
  }
  return Buffer.from(bytes).toString('utf8')
}

export function processIo(): Io {
  return {
    stdinIsTty: Boolean(process.stdin.isTTY),
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
    readStdin: readAllStdin,
    promptHidden: promptHiddenTty,
  }
}

// --password-stdin: line 1 is the password, the rest is returned for the command to use.
export function splitFirstLine(text: string): [string, string] {
  const index = text.indexOf('\n')
  if (index === -1) return [text.replace(/\r$/, ''), '']
  return [text.slice(0, index).replace(/\r$/, ''), text.slice(index + 1)]
}

export function stripOneNewline(text: string): string {
  return text.replace(/\r?\n$/, '')
}
