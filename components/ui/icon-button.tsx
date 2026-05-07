import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const iconButtonVariants = cva(
  'flex shrink-0 cursor-pointer items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        toolbar: 'rounded-full text-text-faint hover:bg-white/6 hover:text-foreground',
        menu: 'rounded-md text-text-faint hover:bg-muted hover:text-foreground',
        'menu-destructive': 'rounded-md text-text-faint hover:bg-neg/10 hover:text-neg',
      },
      size: {
        sm: 'size-7',
        md: 'size-8.5',
        lg: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'toolbar',
      size: 'md',
    },
  },
)

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(iconButtonVariants({ variant, size, className }))}
      {...props}
    />
  ),
)
IconButton.displayName = 'IconButton'
