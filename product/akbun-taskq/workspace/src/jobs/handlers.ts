import type { JobHandler } from './runner.ts'
import { exportWikiJob, importWikiJob } from '../wiki/transfer.ts'

// Every kind of background job and the code that runs it.
export const JOB_HANDLERS: Record<string, JobHandler> = {
  wiki_export: exportWikiJob,
  wiki_import: importWikiJob,
}
