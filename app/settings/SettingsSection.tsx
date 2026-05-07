import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function SettingsSection({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-1', className)}>
      <h2 className="mb-1 text-16 font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

export function SettingsRow({
  label,
  description,
  children,
}: {
  label: string
  description?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="text-14 text-foreground">{label}</div>
        {description && (
          <div className="mt-0.5 text-12 text-muted-foreground">{description}</div>
        )}
      </div>
      {children !== undefined && <div className="flex shrink-0 items-center">{children}</div>}
    </div>
  )
}
