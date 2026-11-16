// What the API may ask of the runner in the same process. The demo server and the tests have no runner and use the
// no-op control: a run-now request then waits for the next claim like any other ready task.
export interface RunControl {
  // The task is already ready; claim it before other ready tasks as soon as a slot is free.
  runNow(taskId: string): void
}

export const noRunControl: RunControl = {
  runNow() {},
}
