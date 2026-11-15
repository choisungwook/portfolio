export const CLIP_LIMIT = 500

// Clips each string leaf. Call after masking, so a secret cut at the limit is already redacted.
export function clipDeep(value: unknown, limit = CLIP_LIMIT): unknown {
  if (typeof value === 'string') {
    return value.length <= limit ? value : `${value.slice(0, limit)}…(+${value.length - limit} chars)`
  }
  if (Array.isArray(value)) return value.map((item) => clipDeep(item, limit))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clipDeep(v, limit)]))
  }
  return value
}
