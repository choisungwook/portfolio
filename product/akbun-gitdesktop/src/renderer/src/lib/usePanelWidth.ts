import { useCallback, useState } from 'react'

export function clampPanelWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.min(Math.max(width, minWidth), maxWidth)
}

function loadWidth(key: string, defaultWidth: number, minWidth: number, maxWidth: number): number {
  const stored = Number(localStorage.getItem(key))
  return Number.isFinite(stored) && stored > 0
    ? clampPanelWidth(stored, minWidth, maxWidth)
    : defaultWidth
}

export function usePanelWidth(
  key: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number
): [number, (width: number) => void] {
  const [width, setStoredWidth] = useState(() => loadWidth(key, defaultWidth, minWidth, maxWidth))
  const setWidth = useCallback(
    (nextWidth: number) => {
      const clamped = clampPanelWidth(nextWidth, minWidth, maxWidth)
      setStoredWidth(clamped)
      localStorage.setItem(key, String(clamped))
    },
    [key, maxWidth, minWidth]
  )
  return [width, setWidth]
}
