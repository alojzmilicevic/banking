// Segmented period control. Aloma desktop set: 1W / 1M / 3M / 1Y / All.
// Active pill animates between options via motion's `layoutId` — the pill
// is a shared element across siblings.

import { motion } from 'motion/react'

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
  return (
    <div className="inline-flex items-center gap-0.5 rounded-9 border border-border-subtle bg-elevated p-0.75">
      {ITEMS.map((p) => {
        const active = value === p.id
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`relative z-10 rounded-7 px-3.25 py-1.25 text-xs font-medium transition-colors ${
              active ? 'text-foreground' : 'text-text-faint hover:text-foreground'
            }`}
          >
            {active && (
              <motion.span
                layoutId="period-pill"
                className="absolute inset-0 -z-10 rounded-7 border border-border bg-overlay"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
