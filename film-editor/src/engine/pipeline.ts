import type { FilmPreset } from "./film-presets"
import { applyMatrix, adjustSaturation, adjustTemperature, adjustTint, buildToneCurve, applyCurve, clamp } from "./color"
import { generateGrainLayer, applyGrain } from "./grain"

export interface Adjustments {
  exposure: number
  contrast: number
  brightness: number
  saturation: number
  temperature: number
  tint: number
  highlights: number
  shadows: number
  grain: number
  vignette: number
  fade: number
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  exposure: 0,
  contrast: 0,
  brightness: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  grain: 0,
  vignette: 0,
  fade: 0,
}

let cachedGrain: { w: number; h: number; data: ImageData } | null = null

function getGrain(w: number, h: number, amount: number, size: number): ImageData {
  if (cachedGrain && cachedGrain.w === w && cachedGrain.h === h) {
    return cachedGrain.data
  }
  const data = generateGrainLayer(w, h, amount, size)
  cachedGrain = { w, h, data }
  return data
}

export function processImage(
  source: ImageData,
  preset: FilmPreset,
  adjustments: Adjustments,
): ImageData {
  const { width, height } = source
  const src = source.data
  const output = new ImageData(width, height)
  const dst = output.data

  const exposureMul = Math.pow(2, adjustments.exposure / 100)
  const contrastFactor = (259 * (adjustments.contrast + 255)) / (255 * (259 - adjustments.contrast))
  const satMul = preset.saturation + adjustments.saturation / 100
  const totalTemp = preset.temperature + adjustments.temperature
  const totalTint = preset.tint + adjustments.tint

  const rCurve = buildToneCurve(
    preset.toneCurve.r.blacks,
    preset.toneCurve.r.shadows + adjustments.shadows * 0.3,
    preset.toneCurve.r.midtones,
    preset.toneCurve.r.highlights + adjustments.highlights * 0.3,
    preset.toneCurve.r.whites,
  )
  const gCurve = buildToneCurve(
    preset.toneCurve.g.blacks,
    preset.toneCurve.g.shadows + adjustments.shadows * 0.3,
    preset.toneCurve.g.midtones,
    preset.toneCurve.g.highlights + adjustments.highlights * 0.3,
    preset.toneCurve.g.whites,
  )
  const bCurve = buildToneCurve(
    preset.toneCurve.b.blacks,
    preset.toneCurve.b.shadows + adjustments.shadows * 0.3,
    preset.toneCurve.b.midtones,
    preset.toneCurve.b.highlights + adjustments.highlights * 0.3,
    preset.toneCurve.b.whites,
  )

  const fadeAmount = preset.fadeAmount + adjustments.fade * 0.5
  const cx = width / 2
  const cy = height / 2
  const maxDist = Math.sqrt(cx * cx + cy * cy)
  const vignetteStr = preset.vignette + adjustments.vignette / 100

  for (let i = 0; i < src.length; i += 4) {
    let r = src[i]
    let g = src[i + 1]
    let b = src[i + 2]

    r = clamp(r * exposureMul + adjustments.brightness)
    g = clamp(g * exposureMul + adjustments.brightness)
    b = clamp(b * exposureMul + adjustments.brightness)

    r = clamp(contrastFactor * (r - 128) + 128)
    g = clamp(contrastFactor * (g - 128) + 128)
    b = clamp(contrastFactor * (b - 128) + 128)

    const [mr, mg, mb] = applyMatrix(r, g, b, preset.colorMatrix)
    r = mr; g = mg; b = mb

    r = applyCurve(r, rCurve)
    g = applyCurve(g, gCurve)
    b = applyCurve(b, bCurve)

    const [sr, sg, sb] = adjustSaturation(r, g, b, satMul)
    r = sr; g = sg; b = sb

    if (totalTemp !== 0) {
      const [tr, tg, tb] = adjustTemperature(r, g, b, totalTemp)
      r = tr; g = tg; b = tb
    }
    if (totalTint !== 0) {
      const [tr, tg, tb] = adjustTint(r, g, b, totalTint)
      r = tr; g = tg; b = tb
    }

    if (fadeAmount > 0) {
      r = clamp(r + fadeAmount)
      g = clamp(g + fadeAmount)
      b = clamp(b + fadeAmount)
    }

    if (vignetteStr > 0) {
      const px = (i / 4) % width
      const py = Math.floor(i / 4 / width)
      const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) / maxDist
      const vFactor = 1 - vignetteStr * dist * dist
      r = clamp(r * vFactor)
      g = clamp(g * vFactor)
      b = clamp(b * vFactor)
    }

    dst[i] = r
    dst[i + 1] = g
    dst[i + 2] = b
    dst[i + 3] = src[i + 3]
  }

  const grainAmount = preset.grain.amount + adjustments.grain * 0.5
  if (grainAmount > 0) {
    const grainLayer = getGrain(width, height, grainAmount, preset.grain.size || 2)
    applyGrain(dst, grainLayer, grainAmount / 50)
  }

  return output
}

export function imageToCanvas(img: HTMLImageElement): { canvas: HTMLCanvasElement; imageData: ImageData } {
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0)
  return { canvas, imageData: ctx.getImageData(0, 0, canvas.width, canvas.height) }
}
