import { useRef, useEffect, useState, useCallback } from "react"

interface ImageViewerProps {
  originalImage: HTMLImageElement | null
  processedCanvas: HTMLCanvasElement | null
  compareMode: boolean
  isProcessing: boolean
  onLoadImage: (file: File) => void
}

export function ImageViewer({ originalImage, processedCanvas, compareMode, isProcessing, onLoadImage }: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [sliderPos, setSliderPos] = useState(0.5)
  const [isDragging, setIsDragging] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !processedCanvas || !originalImage) return

    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`

    const ctx = canvas.getContext("2d")!
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, rect.width, rect.height)

    const imgW = originalImage.naturalWidth
    const imgH = originalImage.naturalHeight
    const scale = Math.min(rect.width / imgW, rect.height / imgH) * zoom
    const drawW = imgW * scale
    const drawH = imgH * scale
    const drawX = (rect.width - drawW) / 2 + pan.x
    const drawY = (rect.height - drawH) / 2 + pan.y

    if (compareMode) {
      const splitX = rect.width * sliderPos
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, splitX, rect.height)
      ctx.clip()
      ctx.drawImage(originalImage, drawX, drawY, drawW, drawH)
      ctx.restore()

      ctx.save()
      ctx.beginPath()
      ctx.rect(splitX, 0, rect.width - splitX, rect.height)
      ctx.clip()
      ctx.drawImage(processedCanvas, drawX, drawY, drawW, drawH)
      ctx.restore()

      ctx.beginPath()
      ctx.moveTo(splitX, 0)
      ctx.lineTo(splitX, rect.height)
      ctx.strokeStyle = "#d4a574"
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = "#d4a574"
      ctx.font = "11px system-ui"
      ctx.textAlign = "left"
      ctx.fillText("BEFORE", 8, 20)
      ctx.textAlign = "right"
      ctx.fillText("AFTER", rect.width - 8, 20)
    } else {
      ctx.drawImage(processedCanvas, drawX, drawY, drawW, drawH)
    }
  }, [originalImage, processedCanvas, compareMode, sliderPos, zoom, pan])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => drawCanvas())
    observer.observe(container)
    return () => observer.disconnect()
  }, [drawCanvas])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (compareMode) {
      setIsDragging(true)
      updateSlider(e)
    } else if (e.button === 0) {
      setIsPanning(true)
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && compareMode) {
      updateSlider(e)
    } else if (isPanning) {
      setPan({
        x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
        y: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setIsPanning(false)
  }

  const updateSlider = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setSliderPos(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => Math.max(0.1, Math.min(10, z * delta)))
  }

  const handleDoubleClick = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith("image/")) onLoadImage(file)
  }

  if (!originalImage) {
    return (
      <div
        className="flex-1 flex items-center justify-center bg-film-bg"
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="text-center text-neutral-600">
          <div className="text-6xl mb-4">&#x1f4f7;</div>
          <p className="text-lg">Drop an image here or click "Open Image"</p>
          <p className="text-sm mt-2 text-neutral-700">Supports JPG, PNG, WebP, TIFF</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 relative bg-film-bg overflow-hidden select-none"
      style={{ cursor: compareMode ? "col-resize" : isPanning ? "grabbing" : "grab" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {isProcessing && (
        <div className="absolute top-3 right-3 px-2 py-1 bg-black/60 rounded text-xs text-film-accent">
          Processing...
        </div>
      )}
      <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/60 rounded text-xs text-neutral-400">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  )
}
