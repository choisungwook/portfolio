// Longest-path layering for the task graph. Pure: no DOM.
// A dep row {task_id, depends_on} means depends_on is a predecessor, so it sits one layer left.
// Edges that would close a cycle are ignored so the layout always finishes.
export function layerTasks(tasks, deps) {
  const ids = new Set(tasks.map((t) => t.id))
  const preds = new Map(tasks.map((t) => [t.id, []]))
  for (const dep of deps) {
    if (dep.task_id === dep.depends_on || !ids.has(dep.task_id) || !ids.has(dep.depends_on)) continue
    preds.get(dep.task_id).push(dep.depends_on)
  }

  const layerOf = new Map()
  const state = new Map() // 1 = on the current path, 2 = done
  const visit = (id) => {
    if (state.get(id) === 2) return layerOf.get(id)
    if (state.get(id) === 1) return -1
    state.set(id, 1)
    let layer = 0
    for (const pred of preds.get(id)) {
      const predLayer = visit(pred)
      if (predLayer >= 0) layer = Math.max(layer, predLayer + 1)
    }
    state.set(id, 2)
    layerOf.set(id, layer)
    return layer
  }
  for (const t of tasks) visit(t.id)

  const layers = []
  for (const t of tasks) {
    const layer = layerOf.get(t.id)
    if (!layers[layer]) layers[layer] = []
    layers[layer].push(t.id)
  }
  return { layers, layerOf: Object.fromEntries(layerOf) }
}
