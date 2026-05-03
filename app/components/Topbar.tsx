'use client'
// Top of the main panel — the small label, the big number, the +delta
// pill, and the period pills on the right.
//
// The label/number/delta switch with the sidebar's view selection;
// `total` and `delta` are passed in from the parent who already knows the
// per-view sums.

import { fmtMoney } from '@/lib/format'
import PeriodTabs, { type Period } from './PeriodTabs'
import type { ViewSelection } from './Sidebar'
import { COMBINED_META, HOLDER_LABEL, SHARED_META } from '@/lib/holders'

function viewMeta(view: ViewSelection) {
  if (view === 'all') return COMBINED_META
  if (view === 'shared') return SHARED_META
  return HOLDER_LABEL[view]
}

export default function Topbar({
  view,
  total,
  delta,
  pct,
  currency,
  period,
  onPeriodChange,
}: {
  view: ViewSelection
  total: number | null
  delta: number | null
  pct: number | null
  currency: string | null
  period: Period
  onPeriodChange: (p: Period) => void
}) {
  const meta = viewMeta(view)
  const positive = (delta ?? 0) >= 0
  const showPct = pct != null && Number.isFinite(pct) && Math.abs(pct) <= 500

  return (
    <div
      className="flex shrink-0 items-center justify-between border-b px-[28px] py-[16px]"
      style={{
        background: 'var(--color-background)',
        borderColor: 'var(--color-border-subtle)',
      }}
    >
      <div>
        <div className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
          {meta.label}
        </div>
        <div className="flex items-baseline gap-3">
          <span
            className="font-mono text-[32px] font-light text-foreground tabular-nums"
            style={{ letterSpacing: '-0.03em' }}
          >
            {total != null ? fmtMoney(total, currency) : '—'}
          </span>
          {delta != null && (
            <span
              className="text-[14px] font-medium"
              style={{ color: positive ? 'var(--color-pos)' : 'var(--color-neg)' }}
            >
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
        </div>
      </div>

      <PeriodTabs value={period} onChange={onPeriodChange} />
    </div>
  )
}
