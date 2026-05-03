'use client'
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

export default function PeriodTabs({
  value,
  onChange,
}: {
  value: Period
  onChange: (p: Period) => void
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-[9px] border border-border-subtle p-[3px]"
      style={{ background: 'var(--color-elevated)' }}
    >
      {ITEMS.map((p) => {
        const active = value === p.id
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`relative z-10 rounded-[7px] px-[13px] py-[5px] text-xs font-medium transition-colors ${
              active ? 'text-foreground' : 'text-text-faint hover:text-foreground'
            }`}
          >
            {active && (
              <motion.span
                layoutId="period-pill"
                className="absolute inset-0 -z-10 rounded-[7px] border border-border"
                style={{ background: 'var(--color-overlay)' }}
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
