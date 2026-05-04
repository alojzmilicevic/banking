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
    VariantProps<typeof alertVariants> {}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant, className }))}
      {...props}
    />
  ),
)
Alert.displayName = 'Alert'
