// Segmented period control. Aloma desktop set: 1W / 1M / 3M / 1Y / All.
// Active pill slides between options. Implemented as a single, always-
// mounted motion.div whose x/width we animate to match the active button's
// measured offset — avoids the layoutId mount-flicker issue.

import { motion } from 'motion/react'
import { useLayoutEffect, useRef, useState } from 'react'

export type Period = '1W' | '1M' | '3M' | '1Y' | 'ALL'

const ITEMS: { id: Period; label: string }[] = [
  { id: '1W', label: '1W' },
  { id: '1M', label: '1M' },
  { id: '3M', label: '3M' },
  { id: '1Y', label: '1Y' },
  { id: 'ALL', label: 'All' },
]

export function PeriodTabs({
  value,
  onChange,
}: {
  value: Period
  onChange: (p: Period) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const btn = containerRef.current?.querySelector<HTMLButtonElement>(
      `[data-period="${value}"]`,
    )
    if (!btn) return
    setPill({ x: btn.offsetLeft, width: btn.offsetWidth })
  }, [value])

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center gap-0.5 rounded-9 border border-border-subtle bg-elevated p-0.75"
    >
      {pill && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-0.75 bottom-0.75 left-0 rounded-7 border border-border bg-overlay"
          initial={false}
          animate={{ x: pill.x, width: pill.width }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
      {ITEMS.map((p) => {
        const active = value === p.id
        return (
          <button
            key={p.id}
            type="button"
            data-period={p.id}
            onClick={() => onChange(p.id)}
            className={`relative cursor-pointer rounded-7 px-3.25 py-1.25 text-xs font-medium transition-colors ${
              active ? 'text-foreground' : 'text-text-faint hover:text-foreground'
            }`}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
