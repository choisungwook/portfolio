import { useRef, useEffect, useMemo, useState } from "react"
import type { FilmPreset } from "../engine/film-presets"
import { FILM_PRESETS } from "../engine/film-presets"
import { processImage } from "../engine/pipeline"
import { DEFAULT_ADJUSTMENTS } from "../engine/pipeline"

interface FilmStripProps {
  selectedId: string
  onSelect: (preset: FilmPreset) => void
  originalData: ImageData | null
}

const THUMB_SIZE = 64

const CATEGORIES = [
  { key: "color-negative" as const, label: "Color Neg" },
  { key: "color-positive" as const, label: "Slide" },
  { key: "bw" as const, label: "B&W" },
  { key: "cinema" as const, label: "Cinema" },
]

function createThumbnail(imageData: ImageData): ImageData {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height)
  const ctx = canvas.getContext("2d")!
  ctx.putImageData(imageData, 0, 0)

  const size = THUMB_SIZE
  const thumb = new OffscreenCanvas(size, size)
  const tctx = thumb.getContext("2d")!

  const scale = Math.max(size / imageData.width, size / imageData.height)
  const sw = size / scale
  const sh = size / scale
  const sx = (imageData.width - sw) / 2
  const sy = (imageData.height - sh) / 2

  tctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, size, size)
  return tctx.getImageData(0, 0, size, size)
}

export function FilmStrip({ selectedId, onSelect, originalData }: FilmStripProps) {
  const [activeCategory, setActiveCategory] = useState<FilmPreset["category"]>("color-negative")
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map())

  const thumbSource = useMemo(() => {
    if (!originalData) return null
    return createThumbnail(originalData)
  }, [originalData])

  const filteredPresets = useMemo(
    () => FILM_PRESETS.filter(p => p.id === "original" || p.category === activeCategory),
    [activeCategory],
  )

  useEffect(() => {
    if (!thumbSource) return

    for (const preset of filteredPresets) {
      const canvas = canvasRefs.current.get(preset.id)
      if (!canvas) continue

      canvas.width = THUMB_SIZE
      canvas.height = THUMB_SIZE
      const ctx = canvas.getContext("2d")!

      if (preset.id === "original") {
        ctx.putImageData(thumbSource, 0, 0)
      } else {
        const result = processImage(thumbSource, preset, DEFAULT_ADJUSTMENTS)
        ctx.putImageData(result, 0, 0)
      }
    }
  }, [thumbSource, filteredPresets])

  return (
    <div className="w-full bg-film-surface border-t border-film-border shrink-0">
      <div className="flex items-center gap-1 px-3 pt-2">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
              activeCategory === cat.key
                ? "bg-film-accent text-black font-medium"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 px-3 py-2 overflow-x-auto">
        {filteredPresets.map(preset => (
          <button
            key={preset.id}
            onClick={() => onSelect(preset)}
            className={`shrink-0 flex flex-col items-center gap-1 p-1.5 rounded transition-all ${
              selectedId === preset.id
                ? "ring-2 ring-film-accent bg-neutral-800"
                : "hover:bg-neutral-800/50"
            }`}
          >
            <canvas
              ref={el => {
                if (el) canvasRefs.current.set(preset.id, el)
                else canvasRefs.current.delete(preset.id)
              }}
              width={THUMB_SIZE}
              height={THUMB_SIZE}
              className="rounded block"
              style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
            />
            <span className="text-[10px] text-neutral-400 whitespace-nowrap">
              {preset.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
