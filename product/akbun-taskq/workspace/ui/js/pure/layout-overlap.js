// Overlap layout for calendar blocks. Pure: no DOM, so node can run it.
// Input: runs with started_at and ended_at (null means still running, ends at `now`).
// Output: one entry per visible run with its column, the column count of its overlap cluster, the laid-out
// span (start, end) and runEnd (the real end, clipped to the day, used for labels).
// Runs are clipped to [from, to) so a day column only lays out what it shows.
// minSeconds: a block is drawn at least this tall, so the layout gives it at least this span too.
export function layoutRuns(runs, { now = Date.now() / 1000, from = -Infinity, to = Infinity, minSeconds = 0 } = {}) {
  const items = []
  for (const run of runs) {
    const start = Math.max(run.started_at, from)
    const runEnd = Math.min(run.ended_at ?? now, to)
    if (run.started_at >= to || runEnd < start) continue
    items.push({ run, start, end: Math.max(runEnd, start + minSeconds), runEnd })
  }
  items.sort((a, b) => a.start - b.start || b.end - a.end)

  const out = []
  let cluster = []
  let clusterEnd = -Infinity
  let columnEnds = []
  const flush = () => {
    const columns = Math.max(...cluster.map((c) => c.column)) + 1
    for (const c of cluster) out.push({ run: c.run, column: c.column, columns, start: c.start, end: c.end, runEnd: c.runEnd })
    cluster = []
    columnEnds = []
  }

  for (const item of items) {
    if (cluster.length > 0 && item.start >= clusterEnd) flush()
    let column = columnEnds.findIndex((end) => end <= item.start)
    if (column === -1) {
      column = columnEnds.length
      columnEnds.push(item.end)
    } else {
      columnEnds[column] = item.end
    }
    cluster.push({ ...item, column })
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  if (cluster.length > 0) flush()
  return out
}
