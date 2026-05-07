'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function SettingsNav({
  sections,
}: {
  sections: readonly { label: string; href: string }[]
}) {
  const pathname = usePathname()
  return (
    <nav
      className="flex flex-row gap-1 border-b border-border-subtle lg:flex-col lg:border-b-0"
      aria-label="Settings sections"
    >
      {sections.map((s) => {
        const active = pathname === s.href
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative px-3 py-2 text-14 font-medium transition-colors',
              // Desktop pill — left-aligned, full-row, rounded.
              'lg:rounded-9 lg:px-3 lg:py-2',
              active
                ? 'text-foreground lg:bg-white/6'
                : 'text-text-faint hover:text-foreground',
              // Mobile underline — only renders below lg.
              active &&
                'after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-foreground lg:after:hidden',
            )}
          >
            {s.label}
          </Link>
        )
      })}
    </nav>
  )
}
