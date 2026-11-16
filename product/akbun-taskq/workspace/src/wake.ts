// A wake-up signal inside one taskq process. wait() sleeps up to `ms` and returns early when notify() is called or the
// abort signal fires. A write from another process (the CLI) never notifies; the timeout is what picks it up.
export interface WakeSignal {
  notify(): void
  wait(ms: number, abort?: AbortSignal): Promise<void>
}

export function createWakeSignal(): WakeSignal {
  let waiters = new Set<() => void>()
  return {
    notify() {
      const woken = waiters
      waiters = new Set()
      for (const wake of woken) wake()
    },
    wait(ms, abort) {
      return new Promise((resolve) => {
        if (abort?.aborted) return resolve()
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
