// Generic segmented control with a sliding motion-pill highlight.
// Animates a single, always-mounted motion.div whose x/width track the
// active button's measured offset — avoids the layoutId mount-flicker
// issue. Used by PeriodTabs and ChangeModeToggle.

import { motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export type SegmentedControlItem<T extends string> = {
  id: T
  label: string
}

export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: readonly SegmentedControlItem<T>[]
  value: T
  onChange: (next: T) => void
  ariaLabel?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<Map<T, HTMLButtonElement>>(new Map())
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null)

  const measure = useCallback(() => {
    const btn = buttonRefs.current.get(value)
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

  // Track container resizes — fonts loading late or a parent layout
  // (e.g. sidebar drag) shifting button offsets shouldn't leave the pill
  // stuck on its old measurement.
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
      aria-label={ariaLabel}
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
      {items.map((item) => {
        const active = value === item.id
        return (
          <button
            key={item.id}
            ref={(el) => {
              if (el) buttonRefs.current.set(item.id, el)
              else buttonRefs.current.delete(item.id)
            }}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(item.id)}
            className={`relative cursor-pointer rounded-7 px-3.25 py-1.25 text-xs font-medium transition-colors ${
              active ? 'text-foreground' : 'text-text-faint hover:text-foreground'
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
