'use client'

// Preset palette swatches for one holder. Currently rendered in the
// settings page (Household section). The four UI elements that re-tint
// — section card bg/border, header avatar, per-account product badge —
// all read holder.color via the dashboard query, so invalidating that
// query inside useUpdateHolder flips them together.

import { Check } from 'lucide-react'
import { HOLDER_PALETTE } from '@/lib/holders'
import { useUpdateHolder } from '@/lib/queries'
import { cn } from '@/lib/utils'

export function HolderColorPicker({
  holderId,
  currentColor,
}: {
  holderId: string
  currentColor: string
}) {
  const updateHolder = useUpdateHolder()
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="radiogroup"
      aria-label="Holder color"
    >
      {HOLDER_PALETTE.map((color) => {
        const selected = color === currentColor
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Set color to ${color}`}
            onClick={() => {
              if (selected || updateHolder.isPending) return
              updateHolder.mutate({ id: holderId, color })
            }}
            disabled={updateHolder.isPending}
            style={{ '--swatch': color } as React.CSSProperties}
            className={cn(
              'flex size-6 cursor-pointer items-center justify-center rounded-full bg-(--swatch) ring-1 ring-white/10 transition-transform hover:scale-110',
              selected && 'ring-2 ring-white/80',
              updateHolder.isPending && 'cursor-not-allowed opacity-60',
            )}
          >
            {selected && <Check className="size-3.5 text-black/80" strokeWidth={3} />}
          </button>
        )
      })}
    </div>
  )
}
