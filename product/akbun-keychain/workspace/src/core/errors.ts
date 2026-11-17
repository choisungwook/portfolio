// Error codes shared by every surface. The message names keys and limits, never the input that failed.
export type ErrorCode =
  | 'BAD_PASSWORD'
  | 'NOT_INITIALIZED'
  | 'ALREADY_INITIALIZED'
  | 'NOT_FOUND'
  | 'EXISTS'
  | 'INVALID'
  | 'INTEGRITY'
  | 'LOCK_TIMEOUT'

export class KeychainError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'KeychainError'
    this.code = code
  }
}
