const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / 1024 ** unit
  const precision = unit > 0 && value < 10 && !Number.isInteger(value) ? 1 : 0
  return `${value.toFixed(precision)} ${UNITS[unit]}`
}
