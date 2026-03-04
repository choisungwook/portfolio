export function generateGrainLayer(
  width: number,
  height: number,
  amount: number,
  size: number
): ImageData {
  const grainW = Math.ceil(width / size)
  const grainH = Math.ceil(height / size)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext("2d")!

  const noise = new Float32Array(grainW * grainH)
  for (let i = 0; i < noise.length; i++) {
    noise[i] = (Math.random() - 0.5) * 2 * amount
  }

  const imgData = ctx.createImageData(width, height)
  const data = imgData.data
  for (let y = 0; y < height; y++) {
    const gy = Math.min(Math.floor(y / size), grainH - 1)
    for (let x = 0; x < width; x++) {
      const gx = Math.min(Math.floor(x / size), grainW - 1)
      const val = noise[gy * grainW + gx]
      const idx = (y * width + x) * 4
      data[idx] = clampByte(128 + val)
      data[idx + 1] = clampByte(128 + val)
      data[idx + 2] = clampByte(128 + val)
      data[idx + 3] = 255
    }
  }
  return imgData
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

export function applyGrain(
  pixels: Uint8ClampedArray,
  grain: ImageData,
  strength: number
): void {
  const gd = grain.data
  for (let i = 0; i < pixels.length; i += 4) {
    const grainVal = (gd[i] - 128) * strength
    pixels[i] = clampByte(pixels[i] + grainVal)
    pixels[i + 1] = clampByte(pixels[i + 1] + grainVal)
    pixels[i + 2] = clampByte(pixels[i + 2] + grainVal)
  }
}
