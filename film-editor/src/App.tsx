import { useState } from "react"
import { Toolbar } from "./components/Toolbar"
import { ImageViewer } from "./components/ImageViewer"
import { FilmStrip } from "./components/FilmStrip"
import { AdjustmentPanel } from "./components/AdjustmentPanel"
import { useImageProcessor } from "./hooks/useImageProcessor"

export default function App() {
  const editor = useImageProcessor()
  const [compareMode, setCompareMode] = useState(false)

  return (
    <div className="h-full flex flex-col bg-film-bg">
      <Toolbar
        fileName={editor.fileName}
        hasImage={!!editor.originalImage}
        onLoadImage={editor.loadImage}
        onExport={editor.exportImage}
        compareMode={compareMode}
        onToggleCompare={() => setCompareMode(m => !m)}
      />

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <ImageViewer
            originalImage={editor.originalImage}
            processedCanvas={editor.processedCanvas}
            compareMode={compareMode}
            isProcessing={editor.isProcessing}
            onLoadImage={editor.loadImage}
          />
          <FilmStrip
            selectedId={editor.preset.id}
            onSelect={editor.setPreset}
            originalData={editor.originalData}
          />
        </div>

        {editor.originalImage && (
          <AdjustmentPanel
            adjustments={editor.adjustments}
            onUpdate={editor.updateAdjustment}
            onReset={editor.resetAdjustments}
            presetName={editor.preset.name}
          />
        )}
      </div>
    </div>
  )
}
