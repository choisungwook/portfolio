import type { Config } from '../config.ts'
import type { Worker } from '../types.ts'
import { createSdkWorker } from './sdk-worker.ts'

export function createWorker(config: Config): Worker {
  return createSdkWorker(config)
}
