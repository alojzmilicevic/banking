import { holderBg } from '@/lib/holders'
import { cn } from '@/lib/utils'

// `text-[length:var(--text-12)]` instead of bare `text-12`: tailwind-merge
// doesn't know `text-12` is a custom font-size token, so it treats it as
// ambiguous `text-*` and dedupes against the `text-(--avatar-color)` color
// class below — one or the other gets stripped depending on order. The
// explicit `length:` modifier marks this as font-size unambiguously, so
// size and color survive together.
const SIZE_CLASSES = {
  md: 'size-8.5 text-[length:var(--text-12)]',
  lg: 'size-10 text-[length:var(--text-12)]',
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
          '--avatar-border': bordered ? color : 'transparent',
        } as React.CSSProperties
      }
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md border border-(--avatar-border) bg-(--avatar-bg) font-semibold',
        SIZE_CLASSES[size],
        'text-(--avatar-color)',
        className,
      )}
      aria-hidden
    >
      {children}
    </span>
  )
}
