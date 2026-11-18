// A wake-up signal inside one taskq process. A write from another process (the CLI) never notifies; the timeout of
// wait() is what picks it up.
//
// Every notify() bumps a generation number. A waiter reads version() before it looks at the database and passes it to
// wait(); if a notify came in between, wait() returns at once. Without that, a change made while the waiter was busy
// (a tick awaiting preflight, an SSE write) would be noticed only after the timeout.
export interface WakeSignal {
  version(): number
  notify(): void
  wait(ms: number, abort?: AbortSignal, since?: number): Promise<void>
}

export function createWakeSignal(): WakeSignal {
  let generation = 0
  let waiters = new Set<() => void>()
  return {
    version: () => generation,
    notify() {
      generation += 1
      const woken = waiters
      waiters = new Set()
      for (const wake of woken) wake()
    },
    wait(ms, abort, since) {
      return new Promise((resolve) => {
        if (abort?.aborted || (since !== undefined && since !== generation)) return resolve()
        const done = () => {
          clearTimeout(timer)
          waiters.delete(done)
          abort?.removeEventListener('abort', done)
          resolve()
        }
        const timer = setTimeout(done, ms)
        waiters.add(done)
        abort?.addEventListener('abort', done, { once: true })
      })
    },
  }
}

// queueChanged: something may now be claimable or cancellable (an API write, a run that ended, a run-now request).
// The runner waits on it. eventWritten: a row reached the events table. Approval waits and the SSE stream wait on it.
export const queueChanged = createWakeSignal()
export const eventWritten = createWakeSignal()
// teamChanged: an agent may now have mail (a message was posted, a turn ended). The team hub waits on it.
export const teamChanged = createWakeSignal()
