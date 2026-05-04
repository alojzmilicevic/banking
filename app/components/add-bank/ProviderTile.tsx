import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Check } from 'lucide-react'

export function ProviderTile({
  icon,
  tone,
  title,
  subtitle,
  hint,
  linked,
  disabled,
  onClick,
}: {
  icon: ReactNode
  tone: string
  title: string
  subtitle: string
  hint: string
  linked?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={{ y: linked || disabled ? 0 : -2 }}
      whileTap={{ scale: 0.98 }}
      className={`group relative flex flex-col items-start gap-2 overflow-hidden rounded-xl border bg-card p-4 text-left transition-colors ${
        linked
          ? 'border-pos/30 opacity-70 hover:opacity-100'
          : 'border-border hover:border-input-border'
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <div
        className={`pointer-events-none absolute inset-0 ${tone} ${linked ? 'opacity-30' : 'opacity-70'}`}
        aria-hidden
      />
      {linked && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-pos-bg/80 px-1.5 py-0.5 text-9 font-medium text-pos">
          <Check className="size-2.5" strokeWidth={3} />
          Linked
        </span>
      )}
      <div className="relative flex size-9 items-center justify-center rounded-lg bg-secondary/80 text-foreground">
        {icon}
      </div>
      <div className="relative">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-11 text-muted-foreground">{subtitle}</p>
      </div>
      <div className="relative mt-auto flex items-center gap-1 text-11 text-muted-foreground">
        {hint}
        <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </motion.button>
  )
}
