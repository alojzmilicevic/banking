'use client'
// Two-way segmented control: who in the household is *linking* this bank.
// "Joint" is no longer manually picked — when an IBAN appears under both
// holders, the backend tags those accounts as joint automatically.

import { motion } from 'motion/react'
import type { Holder } from '@/lib/queries'

type LinkerHolder = Exclude<Holder, 'joint'>

const ITEMS: { id: LinkerHolder; label: string; emoji: string }[] = [
  { id: 'alma', label: 'Alma', emoji: '🌷' },
  { id: 'alojz', label: 'Alojz', emoji: '🦊' },
]

export default function HolderPicker({
  value,
  onChange,
}: {
  value: LinkerHolder
  onChange: (h: LinkerHolder) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary/60 p-0.5 text-sm">
      {ITEMS.map((item) => {
        const active = value === item.id
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`relative z-10 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 font-medium transition-colors ${
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {active && (
              <motion.span
                layoutId="holder-pill"
                className="absolute inset-0 -z-10 rounded-md bg-card shadow-sm ring-1 ring-input-border"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span aria-hidden>{item.emoji}</span>
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
