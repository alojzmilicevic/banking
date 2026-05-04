import * as React from 'react'
import { cn } from '@/lib/utils'

export const Skeleton = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    aria-hidden
    className={cn(
      'animate-pulse rounded-[6px] bg-[rgba(255,255,255,0.06)]',
      className,
    )}
    {...props}
  />
))
Skeleton.displayName = 'Skeleton'
