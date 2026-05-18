'use client'

// Preset palette swatches for one holder. Currently rendered in the
// settings page (Household section). The four UI elements that re-tint
// — section card bg/border, header avatar, per-account product badge —
// all read holder.color via the dashboard query, so invalidating that
// query inside useUpdateHolder flips them together.

import { Check } from 'lucide-react'
import { HOLDER_PALETTE } from '@/lib/holders'
import { useHolders, useUpdateHolder } from '@/lib/queries'
import { cn } from '@/lib/utils'

export function HolderColorPicker({
  holderId,
  currentColor,
}: {
  holderId: string
  currentColor: string
}) {
  const updateHolder = useUpdateHolder()
  const holders = useHolders()
  // Map each taken color → the label of the holder using it, so the
  // tooltip on a disabled swatch can name the conflicting holder. The
  // current holder's color is excluded from "taken" (you can still see
  // your own selection highlighted).
  const takenBy = new Map<string, string>()
  for (const h of holders.data ?? []) {
    if (h.id !== holderId) takenBy.set(h.color, h.label)
  }
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="radiogroup"
      aria-label="Holder color"
    >
      {HOLDER_PALETTE.map((color) => {
        const selected = color === currentColor
        const conflict = takenBy.get(color)
        const disabled = updateHolder.isPending || (!!conflict && !selected)
        const title = conflict && !selected ? `Used by ${conflict}` : `Set color to ${color}`
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={title}
            aria-disabled={disabled}
            title={title}
            onClick={() => {
              if (selected || disabled) return
              updateHolder.mutate({ id: holderId, color })
            }}
            disabled={disabled}
            style={{ '--swatch': color } as React.CSSProperties}
            className={cn(
              'flex size-6 cursor-pointer items-center justify-center rounded-full bg-(--swatch) ring-1 ring-white/10 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90',
              selected && 'ring-2 ring-white/80',
              disabled && 'cursor-not-allowed opacity-40 hover:scale-100',
            )}
          >
            {selected && <Check className="size-3.5 text-black/80" strokeWidth={3} />}
          </button>
        )
      })}
    </div>
  )
}
