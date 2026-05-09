import * as React from 'react'
import { cn } from '@/lib/utils'

export function Card({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  ref?: React.Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={ref}
      className={cn(
        'mb-4 rounded-lg border border-border bg-card px-5 py-4 text-card-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function CardTitle({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & {
  ref?: React.Ref<HTMLHeadingElement>
}) {
  return (
    <h2
      ref={ref}
      className={cn('m-0 text-16 font-semibold', className)}
      {...props}
    />
  )
}
