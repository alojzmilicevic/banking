import * as React from 'react'
import { cn } from '@/lib/utils'

export function Table({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLTableElement> & {
  ref?: React.Ref<HTMLTableElement>
}) {
  return (
    <table
      ref={ref}
      className={cn('mt-1 w-full border-collapse text-sm', className)}
      {...props}
    />
  )
}

export function TableHeader({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement> & {
  ref?: React.Ref<HTMLTableSectionElement>
}) {
  return <thead ref={ref} className={cn('', className)} {...props} />
}

export function TableBody({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement> & {
  ref?: React.Ref<HTMLTableSectionElement>
}) {
  return <tbody ref={ref} className={cn('', className)} {...props} />
}

export function TableRow({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & {
  ref?: React.Ref<HTMLTableRowElement>
}) {
  return <tr ref={ref} className={cn('', className)} {...props} />
}

export function TableHead({
  className,
  ref,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  ref?: React.Ref<HTMLTableCellElement>
}) {
  return (
    <th
      ref={ref}
      className={cn(
        'border-b border-border px-3 py-2 text-left text-11 font-medium uppercase tracking-eyebrow text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({
  className,
  ref,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  ref?: React.Ref<HTMLTableCellElement>
}) {
  return (
    <td
      ref={ref}
      className={cn(
        'border-b border-border px-3 py-2 text-sm align-middle',
        className,
      )}
      {...props}
    />
  )
}
