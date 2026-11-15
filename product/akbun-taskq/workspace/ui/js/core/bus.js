// Tiny event bus so views can open each other's dialogs without importing each other.
const handlers = new Map()

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, [])
  handlers.get(name).push(fn)
}

export function emit(name, arg) {
  for (const fn of handlers.get(name) ?? []) fn(arg)
}
