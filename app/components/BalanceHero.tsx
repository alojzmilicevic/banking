import { fmtMoney } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import { cn } from '@/lib/utils'
import type { Period } from './PeriodTabs'

// Hero rendering for the topbar (desktop) and the mobile balance
// section. Two variants are mostly the same content (label + total +
// delta) with different typographic emphasis — desktop folds the delta
// into one inline string; mobile splits it into a pct pill + a delta
// sub-line that includes the period.
export function BalanceHero({
  label,
  total,
  delta,
  pct,
  currency,
  period,
  variant,
}: {
  label: string
  total: number | null
  delta: number | null
  pct: number | null
  currency: string | null
  period: Period
  variant: 'topbar' | 'mobile'
}) {
  const positive = (delta ?? 0) >= 0
  const showPct = pct != null && Number.isFinite(pct) && Math.abs(pct) <= 500

  if (variant === 'topbar') {
    return (
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
                  {Math.abs(pct).toFixed(1)}%
                </span>
              )}
            </span>
          )}
        </Sensitive>
      </div>
    )
  }

  return (
    <>
      <div className="mb-1.5 text-11 font-medium uppercase tracking-eyebrow text-text-faint">
        {label}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-30 font-light leading-none tracking-hero text-foreground tabular-nums">
          <Sensitive>{total != null ? fmtMoney(total, currency) : '—'}</Sensitive>
        </span>
        {showPct && (
          <span
            className={cn(
              'rounded-full px-2.5 py-0.75 text-14 font-semibold',
              positive ? 'bg-pos-bg text-pos' : 'bg-white/6 text-neg',
            )}
          >
            <Sensitive>
              {positive ? '+' : '−'}
              {Math.abs(pct).toFixed(2)}%
            </Sensitive>
          </span>
        )}
      </div>
      {delta != null && (
        <div
          className={cn(
            'mt-1.5 font-mono text-14 font-light tracking-tight tabular-nums',
            positive ? 'text-pos' : 'text-neg',
          )}
        >
          <Sensitive>
            {positive ? '+' : ''}
            {fmtMoney(delta, currency)}
          </Sensitive>{' '}
          · {period === 'ALL' ? 'All' : period}
        </div>
      )}
    </>
  )
}
