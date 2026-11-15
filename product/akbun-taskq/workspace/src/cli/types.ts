import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'

export interface CliContext {
  config: Config
  db: Db
}

export type Command = (ctx: CliContext, args: string[]) => void | Promise<void>
