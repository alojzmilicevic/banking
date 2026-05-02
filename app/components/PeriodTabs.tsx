'use client'
// Segmented period control. The active pill animates between options via
// motion's `layoutId` — the pill is a shared element across siblings.

import { motion } from 'motion/react'

export type Period = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL'

const ITEMS: { id: Period; label: string }[] = [
  { id: '1W', label: '1W' },
  { id: '1M', label: '1M' },
  { id: '3M', label: '3M' },
  { id: '6M', label: '6M' },
  { id: 'YTD', label: 'YTD' },
  { id: '1Y', label: '1Y' },
  { id: 'ALL', label: 'All' },
]

export default function PeriodTabs({
  value,
  onChange,
}: {
  value: Period
  onChange: (p: Period) => void
}) {
  return (
    <div className="inline-flex items-center rounded-full bg-secondary/60 p-0.5 text-xs">
      {ITEMS.map((p) => {
        const active = value === p.id
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`relative z-10 rounded-full px-3 py-1.5 font-medium transition-colors ${
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {active && (
              <motion.span
                layoutId="period-pill"
                className="absolute inset-0 -z-10 rounded-full bg-card shadow-sm ring-1 ring-input-border"
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
