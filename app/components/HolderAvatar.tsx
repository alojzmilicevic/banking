import { holderBg, holderBorder } from '@/lib/holders'
import { cn } from '@/lib/utils'

const SIZE_CLASSES = {
  md: 'size-8.5 text-14',
  lg: 'size-10 text-14',
} as const

export type HolderAvatarSize = keyof typeof SIZE_CLASSES

export function HolderAvatar({
  color,
  size = 'md',
  bordered = true,
  className,
  children,
}: {
  color: string
  size?: HolderAvatarSize
  bordered?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      style={
        {
          '--avatar-bg': holderBg(color),
          '--avatar-color': color,
          '--avatar-border': bordered ? holderBorder(color) : 'transparent',
        } as React.CSSProperties
      }
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border-thin border-(--avatar-border) bg-(--avatar-bg) font-semibold text-(--avatar-color)',
        SIZE_CLASSES[size],
        className,
      )}
      aria-hidden
    >
      {children}
    </span>
  )
}
