// Two-way segmented control: show change pills as absolute value (kr)
// or percentage (%). Lives next to the period tabs above the chart.
// Same visual treatment as PeriodTabs (motion-pill, rounded segments)
// so the two reads as a single control surface.

import { motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export type ChangeMode = 'abs' | 'pct'

const ITEMS: { id: ChangeMode; label: string }[] = [
  { id: 'abs', label: 'kr' },
  { id: 'pct', label: '%' },
]

export function ChangeModeToggle({
  value,
  onChange,
}: {
  value: ChangeMode
  onChange: (m: ChangeMode) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null)

  const measure = useCallback(() => {
    const btn = containerRef.current?.querySelector<HTMLButtonElement>(
      `[data-mode="${value}"]`,
    )
    if (!btn) return
    setPill((prev) => {
      const next = { x: btn.offsetLeft, width: btn.offsetWidth }
      if (prev && prev.x === next.x && prev.width === next.width) return prev
      return next
    })
  }, [value])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center gap-0.5 rounded-9 border border-border-subtle bg-elevated p-0.75"
      role="radiogroup"
      aria-label="Change display mode"
    >
      {pill && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0.75 left-0 rounded-7 border border-border bg-overlay"
          initial={false}
          animate={{ x: pill.x, width: pill.width }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
      {ITEMS.map((m) => {
        const active = value === m.id
        return (
          <button
            key={m.id}
            type="button"
            data-mode={m.id}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m.id)}
            className={`relative cursor-pointer rounded-7 px-3.25 py-1.25 text-xs font-medium transition-colors ${
              active ? 'text-foreground' : 'text-text-faint hover:text-foreground'
            }`}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
