import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import { jobsChanged } from '../wake.ts'
import { claimNextJob, endJob, isCancelRequested, recoverJobs, saveProgress, type Job } from './store.ts'

// Runs background jobs one at a time in the taskq process. A handler works in steps and reports each one with
// `step`, which saves the checkpoint and returns false when the user asked to cancel; the handler then returns early
// and the job ends as cancelled with its checkpoint kept, so Resume continues from there. Jobs created by the CLI or
// the MCP server are picked up on the next poll.

export interface JobContext {
  db: Db
  config: Config
  job: Job
  // Records progress; returns false when the job should stop now (cancel asked).
  step(progress: { done: number; total?: number; checkpoint?: unknown; message?: string }): boolean
}

export type JobHandler = (ctx: JobContext) => Promise<Record<string, unknown> | 'cancelled'>

export interface JobRunner {
  start(): void
  stop(): Promise<void>
  idle(): Promise<void>   // resolves when nothing is queued or running (tests)
}

export function createJobRunner(db: Db, config: Config, handlers: Record<string, JobHandler>, pollMs = 2000): JobRunner {
  let running = false
  let current: Promise<void> = Promise.resolve()
  const stopped = new AbortController()

  async function runOne(job: Job): Promise<void> {
    const handler = handlers[job.kind]
    if (!handler) {
      endJob(db, job.id, { status: 'failed', error: `no handler for job kind ${job.kind}` })
      return
    }
    const ctx: JobContext = {
      db, config, job,
      step(progress) {
        saveProgress(db, job.id, progress)
        jobsChanged.notify()
        return running && !isCancelRequested(db, job.id)
      },
    }
    try {
      const result = await handler(ctx)
      if (result === 'cancelled') {
        // A stop for shutdown leaves the job queued, so it continues after the restart; a user's cancel ends it.
        if (!running && !isCancelRequested(db, job.id)) db.prepare(`UPDATE jobs SET status = 'queued' WHERE id = ?`).run(job.id)
        else endJob(db, job.id, { status: 'cancelled', message: 'cancelled; resume continues from the last step' })
      } else {
        endJob(db, job.id, { status: 'done', result, message: 'done' })
      }
    } catch (error) {
      endJob(db, job.id, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
    }
  }

  async function loop(): Promise<void> {
    let seen = jobsChanged.version()
    while (running) {
      const job = claimNextJob(db)
      if (job) {
        current = runOne(job)
        await current
        continue
      }
      await jobsChanged.wait(pollMs, stopped.signal, seen)
      seen = jobsChanged.version()
    }
  }

  return {
    start() {
      recoverJobs(db)
      running = true
      void loop()
    },
    async stop() {
      running = false
      stopped.abort()
      await current
    },
    async idle() {
      for (;;) {
        await current
        const busy = db.prepare(`SELECT 1 FROM jobs WHERE status IN ('queued', 'running') LIMIT 1`).get()
        if (!busy) return
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    },
  }
}
