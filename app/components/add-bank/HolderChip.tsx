import { motion } from 'motion/react'
import { Check } from 'lucide-react'
import type { HolderListItem } from '@/lib/queries'
import { holderTint } from '@/lib/holders'

export function HolderChip({
  holder,
  active,
  onPick,
  linkedSummary,
}: {
  holder: HolderListItem
  active: boolean
  onPick: () => void
  linkedSummary: string | null
}) {
  const tint = holderTint(holder.color)
  const initials = holder.initials ?? holder.label.slice(0, 2).toUpperCase()
  return (
    <motion.button
      type="button"
      onClick={onPick}
      whileTap={{ scale: 0.97 }}
      aria-pressed={active}
      className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
        active
          ? 'border-primary bg-card shadow-md ring-2 ring-primary/20'
          : 'border-border bg-card/30 opacity-60 hover:border-input-border hover:opacity-100'
      }`}
    >
      {active && (
        <motion.div
          layoutId="holder-bg"
          style={
            {
              '--tint-grad': `linear-gradient(135deg, ${tint} 0%, transparent 100%)`,
            } as React.CSSProperties
          }
          className="absolute inset-0 -z-10 bg-(image:--tint-grad)"
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
      <span
        style={
          {
            '--avatar-bg': `${holder.color}22`,
            '--avatar-color': holder.color,
            '--avatar-border': active ? `${holder.color}55` : 'transparent',
          } as React.CSSProperties
        }
        className="flex size-10 shrink-0 items-center justify-center rounded-full border-thin border-(--avatar-border) bg-(--avatar-bg) text-14 font-semibold text-(--avatar-color) transition-all"
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold transition-colors ${
            active ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {holder.label}
        </p>
        <p
          className={`text-11 transition-colors ${
            active ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          {linkedSummary
            ? `${active ? 'Selected · ' : ''}${linkedSummary}`
            : active
              ? 'Selected · nothing linked'
              : 'Nothing linked'}
        </p>
      </div>
      {active && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
          aria-hidden
        >
          <Check className="size-3" strokeWidth={3} />
        </motion.span>
      )}
    </motion.button>
  )
}
