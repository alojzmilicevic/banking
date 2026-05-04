// Top of the main panel — the small label, the big number, the +delta
// pill, and the period pills on the right.
//
// `label` resolves in the parent (HomeContent) since holders are dynamic
// now — Topbar doesn't need to know how to map a view key to a name.

import { Loader2, RefreshCw } from 'lucide-react'
import { fmtMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Sensitive, SensitiveToggle } from '@/components/sensitive-data'
import { PeriodTabs, type Period } from './PeriodTabs'

export function Topbar({
  label,
  total,
  delta,
  pct,
  currency,
  period,
  onPeriodChange,
  onSyncAll,
  syncingAll,
}: {
  label: string
  total: number | null
  delta: number | null
  pct: number | null
  currency: string | null
  period: Period
  onPeriodChange: (p: Period) => void
  onSyncAll: () => void
  syncingAll: boolean
}) {
  const positive = (delta ?? 0) >= 0
  const showPct = pct != null && Number.isFinite(pct) && Math.abs(pct) <= 500

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-background px-7 py-4">
      <div>
        <div className="mb-0.5 text-11 font-medium uppercase tracking-eyebrow text-text-faint">
          {label}
        </div>
        <Sensitive className="flex items-baseline gap-3">
          <span className="font-mono text-30 font-light tracking-hero text-foreground tabular-nums">
            {total != null ? fmtMoney(total, currency) : '—'}
          </span>
          {delta != null && (
            <span className={cn('text-14 font-medium', positive ? 'text-pos' : 'text-neg')}>
              {positive ? '+' : ''}
              {fmtMoney(delta, currency)}
              {showPct && (
                <span className="text-text-faint">
                  {' · '}
                  {positive ? '+' : '−'}
                  {Math.abs(pct!).toFixed(1)}%
                </span>
              )}
            </span>
          )}
        </Sensitive>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSyncAll}
          disabled={syncingAll}
          aria-label="Sync all banks"
          title="Sync all banks"
          className="flex size-9 items-center justify-center rounded-full text-text-faint transition-colors hover:bg-white/6 hover:text-foreground disabled:opacity-50"
        >
          {syncingAll ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </button>
        <SensitiveToggle />
        <PeriodTabs value={period} onChange={onPeriodChange} />
      </div>
    </div>
  )
}
