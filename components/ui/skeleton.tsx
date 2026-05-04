import { cn } from '@/lib/utils'

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-[6px] bg-[rgba(255,255,255,0.06)] motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  )
}
