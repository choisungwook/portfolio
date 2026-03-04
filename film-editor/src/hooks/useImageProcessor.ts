import { useState, useCallback, useRef, useEffect } from "react"
import type { FilmPreset } from "../engine/film-presets"
import { FILM_PRESETS } from "../engine/film-presets"
import { processImage, imageToCanvas, DEFAULT_ADJUSTMENTS } from "../engine/pipeline"
import type { Adjustments } from "../engine/pipeline"

export interface EditorState {
  originalImage: HTMLImageElement | null
  originalData: ImageData | null
  processedCanvas: HTMLCanvasElement | null
  preset: FilmPreset
  adjustments: Adjustments
  isProcessing: boolean
  fileName: string
}

export function useImageProcessor() {
  const [state, setState] = useState<EditorState>({
    originalImage: null,
    originalData: null,
    processedCanvas: null,
    preset: FILM_PRESETS[0],
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    isProcessing: false,
    fileName: "",
  })

  const processingRef = useRef(false)
  const pendingRef = useRef<{ preset: FilmPreset; adjustments: Adjustments } | null>(null)

  const runProcess = useCallback((imageData: ImageData, preset: FilmPreset, adjustments: Adjustments) => {
    if (processingRef.current) {
      pendingRef.current = { preset, adjustments }
      return
    }

    processingRef.current = true
    setState(s => ({ ...s, isProcessing: true }))

    requestAnimationFrame(() => {
      const result = processImage(imageData, preset, adjustments)
      const canvas = document.createElement("canvas")
      canvas.width = result.width
      canvas.height = result.height
      canvas.getContext("2d")!.putImageData(result, 0, 0)

      setState(s => ({ ...s, processedCanvas: canvas, isProcessing: false }))
      processingRef.current = false

      if (pendingRef.current) {
        const next = pendingRef.current
        pendingRef.current = null
        runProcess(imageData, next.preset, next.adjustments)
      }
    })
  }, [])

  const loadImage = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const { imageData } = imageToCanvas(img)
      const preset = FILM_PRESETS[0]
      const adjustments = { ...DEFAULT_ADJUSTMENTS }
      setState(s => ({
        ...s,
        originalImage: img,
        originalData: imageData,
        preset,
        adjustments,
        fileName: file.name,
      }))
      runProcess(imageData, preset, adjustments)
      URL.revokeObjectURL(url)
    }
    img.src = url
  }, [runProcess])

  const setPreset = useCallback((preset: FilmPreset) => {
    setState(s => {
      if (!s.originalData) return s
      runProcess(s.originalData, preset, s.adjustments)
      return { ...s, preset }
    })
  }, [runProcess])

  const setAdjustments = useCallback((adjustments: Adjustments) => {
    setState(s => {
      if (!s.originalData) return s
      runProcess(s.originalData, s.preset, adjustments)
      return { ...s, adjustments }
    })
  }, [runProcess])

  const updateAdjustment = useCallback(<K extends keyof Adjustments>(key: K, value: Adjustments[K]) => {
    setState(s => {
      if (!s.originalData) return s
      const newAdj = { ...s.adjustments, [key]: value }
      runProcess(s.originalData, s.preset, newAdj)
      return { ...s, adjustments: newAdj }
    })
  }, [runProcess])

  const resetAdjustments = useCallback(() => {
    setAdjustments({ ...DEFAULT_ADJUSTMENTS })
  }, [setAdjustments])

  const exportImage = useCallback((format: "png" | "jpeg" = "jpeg", quality = 0.95) => {
    if (!state.processedCanvas) return
    const link = document.createElement("a")
    const ext = format === "jpeg" ? "jpg" : "png"
    const base = state.fileName.replace(/\.[^.]+$/, "")
    link.download = `${base}_${state.preset.id}.${ext}`
    link.href = state.processedCanvas.toDataURL(`image/${format}`, quality)
    link.click()
  }, [state.processedCanvas, state.fileName, state.preset.id])

  useEffect(() => {
    if (state.originalData) {
      runProcess(state.originalData, state.preset, state.adjustments)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    ...state,
    loadImage,
    setPreset,
    setAdjustments,
    updateAdjustment,
    resetAdjustments,
    exportImage,
  }
}
