import { useRef } from "react"

interface ToolbarProps {
  fileName: string
  hasImage: boolean
  onLoadImage: (file: File) => void
  onExport: (format: "png" | "jpeg") => void
  compareMode: boolean
  onToggleCompare: () => void
}

export function Toolbar({ fileName, hasImage, onLoadImage, onExport, compareMode, onToggleCompare }: ToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onLoadImage(file)
  }

  return (
    <header className="flex items-center justify-between h-12 px-4 bg-film-surface border-b border-film-border shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold tracking-wide text-film-accent">FILM EDITOR</h1>
        {fileName && (
          <span className="text-xs text-neutral-500 truncate max-w-48">{fileName}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {hasImage && (
          <>
            <button
              onClick={onToggleCompare}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                compareMode
                  ? "bg-film-accent text-black"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              Before / After
            </button>
            <button
              onClick={() => onExport("jpeg")}
              className="px-3 py-1.5 text-xs bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 transition-colors"
            >
              Export JPG
            </button>
            <button
              onClick={() => onExport("png")}
              className="px-3 py-1.5 text-xs bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 transition-colors"
            >
              Export PNG
            </button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="px-3 py-1.5 text-xs bg-film-accent text-black rounded font-medium hover:bg-film-accent-hover transition-colors"
        >
          Open Image
        </button>
      </div>
    </header>
  )
}
