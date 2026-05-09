import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const alertVariants = cva(
  'mb-4 rounded-md border px-4 py-3 text-sm wrap-break-word',
  {
    variants: {
      variant: {
        destructive: 'bg-error-bg border-error-border text-error-foreground',
        warn: 'bg-warn-bg border-warn/40 text-warn',
      },
    },
    defaultVariants: { variant: 'destructive' },
  },
)

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  ref?: React.Ref<HTMLDivElement>
  onDismiss?: () => void
}

export function Alert({ className, variant, ref, onDismiss, children, ...props }: AlertProps) {
  return (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant, className }))}
      {...props}
    >
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="float-right -mr-1 -mt-0.5 text-xs opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      )}
      {children}
    </div>
  )
}
