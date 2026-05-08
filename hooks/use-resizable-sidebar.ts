'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

interface Options {
  initialWidth: number
  cookieName: string
  clamp: (n: number) => number
  cookieMaxAgeSec?: number
}

export interface ResizableSidebar {
  width: number
  isResizing: boolean
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  setWidth: (n: number) => void
}

// Persistent, drag-to-resize sidebar width. Reads/writes a cookie so SSR
// can render the right width on first paint without a client-side flicker.
export function useResizableSidebar({
  initialWidth,
  cookieName,
  clamp,
  cookieMaxAgeSec = 60 * 60 * 24 * 365,
}: Options): ResizableSidebar {
  const [width, setWidthState] = useState(initialWidth)
  const [isResizing, setIsResizing] = useState(false)
  const widthAtDragStart = useRef(width)
  const xAtDragStart = useRef(0)

  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    e.preventDefault()
    widthAtDragStart.current = width
    xAtDragStart.current = e.clientX
    setIsResizing(true)
  }

  function setWidth(n: number) {
    setWidthState(clamp(n))
  }

  // Window-level pointer listeners for the duration of a drag — beats
  // attaching to the handle because the cursor leaves it the moment you
  // start moving fast.
  useEffect(() => {
    if (!isResizing) return
    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - xAtDragStart.current
      setWidthState(clamp(widthAtDragStart.current + dx))
    }
    function onUp() {
      setIsResizing(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
    }
  }, [isResizing, clamp])

  // Persist on drag end only — touching document.cookie at ~60Hz
  // serializes through a slow path.
  useEffect(() => {
    if (isResizing) return
    if (typeof document === 'undefined') return
    document.cookie = `${cookieName}=${width}; path=/; max-age=${cookieMaxAgeSec}; SameSite=Lax`
  }, [isResizing, width, cookieName, cookieMaxAgeSec])

  return { width, isResizing, onPointerDown, setWidth }
}
