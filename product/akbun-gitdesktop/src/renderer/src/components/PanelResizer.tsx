import { useEffect, useRef, type JSX, type KeyboardEvent, type PointerEvent } from 'react'
import { clampPanelWidth } from '../lib/usePanelWidth'

interface Props {
  label: string
  width: number
  minWidth: number
  maxWidth: number
  onChange: (width: number) => void
}

interface ResizerProps extends Props {
  widthFromDelta: (startWidth: number, deltaX: number) => number
  widthFromKey: (width: number, key: string) => number | null
}

function PanelResizer({
  label,
  width,
  minWidth,
  maxWidth,
  onChange,
  widthFromDelta,
  widthFromKey
}: ResizerProps): JSX.Element {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)

  useEffect(() => () => document.body.classList.remove('panel-resizing'), [])

  const stopResize = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    document.body.classList.remove('panel-resizing')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width }
    document.body.classList.add('panel-resizing')
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return
    const nextWidth = widthFromDelta(drag.current.startWidth, event.clientX - drag.current.startX)
    onChange(clampPanelWidth(nextWidth, minWidth, maxWidth))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const nextWidth = widthFromKey(width, event.key)
    if (nextWidth === null) return
    event.preventDefault()
    onChange(clampPanelWidth(nextWidth, minWidth, maxWidth))
  }

  return (
    <div
      className="panel-resizer"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopResize}
      onPointerCancel={stopResize}
      onKeyDown={onKeyDown}
    />
  )
}

export function ResizeAfterPanel(props: Props): JSX.Element {
  return (
    <PanelResizer
      {...props}
      widthFromDelta={(startWidth, deltaX) => startWidth + deltaX}
      widthFromKey={(width, key) => {
        if (key === 'ArrowLeft') return width - 16
        if (key === 'ArrowRight') return width + 16
        return null
      }}
    />
  )
}

export function ResizeBeforePanel(props: Props): JSX.Element {
  return (
    <PanelResizer
      {...props}
      widthFromDelta={(startWidth, deltaX) => startWidth - deltaX}
      widthFromKey={(width, key) => {
        if (key === 'ArrowLeft') return width + 16
        if (key === 'ArrowRight') return width - 16
        return null
      }}
    />
  )
}
