export type RGB = [number, number, number]

export function clamp(v: number, min = 0, max = 255): number {
  return v < min ? min : v > max ? max : v
}

export function applyMatrix(r: number, g: number, b: number, matrix: number[]): RGB {
  return [
    clamp(matrix[0] * r + matrix[1] * g + matrix[2] * b),
    clamp(matrix[3] * r + matrix[4] * g + matrix[5] * b),
    clamp(matrix[6] * r + matrix[7] * g + matrix[8] * b),
  ]
}

export function adjustSaturation(r: number, g: number, b: number, amount: number): RGB {
  const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return [
    clamp(gray + amount * (r - gray)),
    clamp(gray + amount * (g - gray)),
    clamp(gray + amount * (b - gray)),
  ]
}

export function adjustTemperature(r: number, g: number, b: number, temp: number): RGB {
  return [
    clamp(r + temp * 0.6),
    clamp(g + temp * 0.1),
    clamp(b - temp * 0.6),
  ]
}

export function adjustTint(r: number, g: number, b: number, tint: number): RGB {
  return [
    clamp(r + tint * 0.2),
    clamp(g - tint * 0.4),
    clamp(b + tint * 0.2),
  ]
}

export function buildToneCurve(
  blacks: number,
  shadows: number,
  midtones: number,
  highlights: number,
  whites: number
): Uint8Array {
  const curve = new Uint8Array(256)
  const points = [
    { x: 0, y: clamp(blacks) },
    { x: 64, y: clamp(64 + shadows) },
    { x: 128, y: clamp(128 + midtones) },
    { x: 192, y: clamp(192 + highlights) },
    { x: 255, y: clamp(whites) },
  ]

  for (let i = 0; i < 256; i++) {
    let segIdx = 0
    for (let j = 0; j < points.length - 1; j++) {
      if (i >= points[j].x) segIdx = j
    }
    const p0 = points[segIdx]
    const p1 = points[segIdx + 1]
    const t = (i - p0.x) / (p1.x - p0.x)
    const smooth = t * t * (3 - 2 * t)
    curve[i] = Math.round(p0.y + smooth * (p1.y - p0.y))
  }
  return curve
}

export function applyCurve(value: number, curve: Uint8Array): number {
  return curve[clamp(Math.round(value))]
}
