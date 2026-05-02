import * as React from 'react'
import { cn } from '@/lib/utils'

// Native <select>. shadcn ships a Radix-based Select but for the two
// dropdowns this app uses (country + bank) the native control is fine
// and saves a portal/animation dependency.
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-9 rounded-md border border-input-border bg-input px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    {children}
  </select>
))
Select.displayName = 'Select'
