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
  action?: { label: string; onClick: () => void; loading?: boolean }
}

export function Alert({
  className,
  variant,
  ref,
  onDismiss,
  action,
  children,
  ...props
}: AlertProps) {
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
          className="float-right -mr-1 -mt-0.5 rounded text-xs opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          ✕
        </button>
      )}
      <div className="flex items-center gap-3">
        <span className="flex-1">{children}</span>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.loading}
            className="shrink-0 rounded border border-current px-2 py-1 text-xs font-medium opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current disabled:opacity-50"
          >
            {action.loading ? 'Retrying…' : action.label}
          </button>
        )}
      </div>
    </div>
  )
}
