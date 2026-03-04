import type { Adjustments } from "../engine/pipeline"

interface AdjustmentPanelProps {
  adjustments: Adjustments
  onUpdate: <K extends keyof Adjustments>(key: K, value: Adjustments[K]) => void
  onReset: () => void
  presetName: string
}

interface SliderConfig {
  key: keyof Adjustments
  label: string
  min: number
  max: number
  step: number
}

const LIGHT_SLIDERS: SliderConfig[] = [
  { key: "exposure", label: "Exposure", min: -100, max: 100, step: 1 },
  { key: "brightness", label: "Brightness", min: -100, max: 100, step: 1 },
  { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1 },
  { key: "highlights", label: "Highlights", min: -100, max: 100, step: 1 },
  { key: "shadows", label: "Shadows", min: -100, max: 100, step: 1 },
]

const COLOR_SLIDERS: SliderConfig[] = [
  { key: "saturation", label: "Saturation", min: -100, max: 100, step: 1 },
  { key: "temperature", label: "Temperature", min: -50, max: 50, step: 1 },
  { key: "tint", label: "Tint", min: -50, max: 50, step: 1 },
]

const EFFECT_SLIDERS: SliderConfig[] = [
  { key: "grain", label: "Grain", min: 0, max: 100, step: 1 },
  { key: "vignette", label: "Vignette", min: 0, max: 100, step: 1 },
  { key: "fade", label: "Fade", min: 0, max: 100, step: 1 },
]

function SliderGroup({ label, sliders, adjustments, onUpdate }: {
  label: string
  sliders: SliderConfig[]
  adjustments: Adjustments
  onUpdate: AdjustmentPanelProps["onUpdate"]
}) {
  return (
    <div>
      <h3 className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-2">{label}</h3>
      <div className="space-y-2">
        {sliders.map(s => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="text-xs text-neutral-400 w-20 shrink-0">{s.label}</span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={adjustments[s.key]}
              onChange={e => onUpdate(s.key, Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-[11px] text-neutral-500 w-8 text-right tabular-nums">
              {adjustments[s.key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AdjustmentPanel({ adjustments, onUpdate, onReset, presetName }: AdjustmentPanelProps) {
  return (
    <div className="w-64 bg-film-surface border-l border-film-border flex flex-col shrink-0 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-film-border">
        <span className="text-xs font-medium text-film-accent">{presetName}</span>
        <button
          onClick={onReset}
          className="text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          Reset
        </button>
      </div>

      <div className="p-3 space-y-4">
        <SliderGroup label="Light" sliders={LIGHT_SLIDERS} adjustments={adjustments} onUpdate={onUpdate} />
        <SliderGroup label="Color" sliders={COLOR_SLIDERS} adjustments={adjustments} onUpdate={onUpdate} />
        <SliderGroup label="Effects" sliders={EFFECT_SLIDERS} adjustments={adjustments} onUpdate={onUpdate} />
      </div>
    </div>
  )
}
