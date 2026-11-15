import { randomBytes } from 'node:crypto'

export function newId(): string {
  return randomBytes(4).toString('hex')
}
