// Error codes shared by every surface. The message names keys and limits, never the input that failed,
// and ends with what to do next.
export const EXIT_CODES = {
  UNEXPECTED: 1,
  NOT_INITIALIZED: 1,
  USAGE: 2,
  INVALID: 2,
  LOCKED: 3,
  BAD_TOKEN: 3,
  DENIED: 4,
  BAD_PASSWORD: 4,
  INTEGRITY: 5,
  LOCK_TIMEOUT: 6,
  NOT_FOUND: 7,
  EXISTS: 8,
  ALREADY_INITIALIZED: 8,
  TIMEOUT: 124,
  SPAWN_FAILED: 125,
} as const

export type ErrorCode = keyof typeof EXIT_CODES

export class KeychainError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'KeychainError'
    this.code = code
  }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(EXIT_CODES, value)
}

export const LOCKED_MESSAGE = 'the vault is locked: ask the user to run `akbun-keychain unlock` in a terminal. Do not retry'
export const NEEDS_PASSWORD_MESSAGE = 'this needs the root password: ask the user to run the command in a terminal'
