import * as React from 'react'
import { cn } from '@/lib/utils'

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'mb-4 rounded-lg border border-border bg-card px-5 py-4 text-card-foreground',
      className,
    )}
    {...props}
  />
))
Card.displayName = 'Card'

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn('m-0 text-[1.05rem] font-semibold', className)}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'
