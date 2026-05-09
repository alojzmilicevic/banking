import * as React from 'react'
import { cn } from '@/lib/utils'

export function Input({
  className,
  type,
  ref,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>
}) {
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex w-full rounded-md border border-input-border bg-input px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
