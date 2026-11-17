// Canonical JSON: object keys sorted, no whitespace. The only input to AAD and the MAC.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>
    const fields = Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    return `{${fields.join(',')}}`
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('canonical: non-finite number')
  if (value === undefined || typeof value === 'function' || typeof value === 'bigint') {
    throw new TypeError(`canonical: unsupported ${typeof value}`)
  }
  return JSON.stringify(value)
}
