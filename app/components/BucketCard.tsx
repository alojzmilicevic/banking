import type { ReactNode } from 'react'
import { fmtMoneyCompact } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import { cn } from '@/lib/utils'

// Shared frame around a sidebar bucket — the colored card with avatar +
// label + count + total/delta + hide-all toggle. Used by both the
// per-holder PersonSection and the SharedSection; the avatar slot and
// total derivation differ but the chrome is identical.
export function BucketCard({
  bg,
  border,
  avatar,
  label,
  visibleCount,
  totalCount,
  total,
  deltaAbsolute,
  allHidden,
  onToggleAll,
  toggleAriaLabel,
  children,
}: {
  bg: string
  border: string
  avatar: ReactNode
  label: string
  visibleCount: number
  totalCount: number
  total: number
  deltaAbsolute: number | null
  allHidden: boolean
  onToggleAll: () => void
  toggleAriaLabel: { hide: string; show: string }
  children: ReactNode
}) {
  const hidden = totalCount - visibleCount
  return (
    <div
      style={{ '--bucket-bg': bg, '--bucket-border': border } as React.CSSProperties}
      className="mb-3 rounded-14 border border-(--bucket-border) bg-(--bucket-bg) px-4.5 py-4"
    >
      <div className="mb-3.5 flex items-center gap-2.5">
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="truncate text-14 font-medium text-foreground">{label}</div>
          <div className="mt-px text-11 text-text-faint">
            {visibleCount}
            {hidden > 0 ? ` of ${totalCount}` : ''}{' '}
            {totalCount === 1 ? 'account' : 'accounts'}
          </div>
        </div>
        <Sensitive className="flex shrink-0 flex-col whitespace-nowrap text-right">
          <span className="font-mono text-16 font-light tracking-display text-foreground tabular-nums">
            {fmtMoneyCompact(total)}
          </span>
          {deltaAbsolute != null && (
            <span
              className={cn(
                'mt-px text-11',
                deltaAbsolute >= 0 ? 'text-pos' : 'text-neg',
              )}
            >
              {deltaAbsolute >= 0 ? '+' : ''}
              {fmtMoneyCompact(Math.abs(deltaAbsolute))}
            </span>
          )}
        </Sensitive>
        <button
          type="button"
          onClick={onToggleAll}
          aria-label={allHidden ? toggleAriaLabel.show : toggleAriaLabel.hide}
          title={allHidden ? 'Show all' : 'Hide all'}
          className={cn(
            'ml-1 shrink-0 rounded-7 border border-border bg-white/5 px-2 py-1.25 text-11 transition-colors',
            allHidden ? 'text-text-faint' : 'text-muted-foreground',
          )}
        >
          {allHidden ? 'Show' : 'Hide'}
        </button>
      </div>
      {children}
    </div>
  )
}
