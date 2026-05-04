// The trio (or N+1) of cards under the chart:
//   ┌────────────┐ ┌────────────┐ ┌────────────┐ ...
//   │ COMBINED   │ │  Person A  │ │  Person B  │
//   │ €X         │ │ €Y         │ │ €Z         │
//   │ +1.2% · 1Y │ │ +2.1% · 1Y │ │ +0.5% · 1Y │
//   └────────────┘ └────────────┘ └────────────┘
//
// One card per holder + a Combined card. Driven by the holders array
// from the dashboard API; adding a person grows the row automatically.

import { fmtMoney } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import { COMBINED_META, holderBg, holderBorder } from '@/lib/holders'
import { cn } from '@/lib/utils'
import type { DashboardHolder } from '@/lib/api/dashboard'
import type { Period } from './PeriodTabs'

export interface SummaryRow {
  label: string
  total: number
  pct: number | null
  color: string
  bg: string
  border: string
}

export function buildSummaryRows({
  totalAll,
  pctAll,
  holders,
  pctByHolder,
}: {
  totalAll: number
  pctAll: number | null
  holders: DashboardHolder[]
  pctByHolder: Record<string, number | null>
}): SummaryRow[] {
  return [
    {
      label: COMBINED_META.label,
      total: totalAll,
      pct: pctAll,
      color: COMBINED_META.color,
      bg: COMBINED_META.bg,
      border: COMBINED_META.border,
    },
    ...holders.map((h) => ({
      label: h.label,
      total: h.total,
      pct: pctByHolder[h.id] ?? null,
      color: h.color,
      bg: holderBg(h.color),
      border: holderBorder(h.color),
    })),
  ]
}

export function SummaryCards({
  rows,
  period,
  currency,
}: {
  rows: SummaryRow[]
  period: Period
  currency: string | null
}) {
  // Grid auto-fits — fixed grid-cols-3 broke when there were >2 holders.
  return (
    <div
      style={{ '--cols': rows.length } as React.CSSProperties}
      className="grid shrink-0 grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-3.5"
    >
      {rows.map((s) => {
        const positive = (s.pct ?? 0) >= 0
        // Suppress garbage % when the baseline was effectively zero (early
        // days of tracking → divide-by-near-zero → 3000%+ noise). > ±500%
        // is almost certainly a tiny base getting funded, not real growth.
        const showPct = s.pct != null && Number.isFinite(s.pct) && Math.abs(s.pct) <= 500
        return (
          <div
            key={s.label}
            style={
              { '--card-bg': s.bg, '--card-border': s.border, '--card-color': s.color } as React.CSSProperties
            }
            className="rounded-14 border border-(--card-border) bg-(--card-bg) px-5 py-4"
          >
            <div className="mb-1.5 text-11 font-medium uppercase tracking-eyebrow text-(--card-color)">
              {s.label}
            </div>
            <div className="font-mono text-24 font-light tracking-display text-foreground tabular-nums">
              <Sensitive>{fmtMoney(s.total, currency)}</Sensitive>
            </div>
            <div className={cn('mt-1 text-12', showPct && !positive ? 'text-neg' : 'text-pos')}>
              {showPct ? (
                <>
                  <Sensitive>{`${positive ? '+' : ''}${s.pct!.toFixed(1)}%`}</Sensitive>
                  {` · ${period}`}
                </>
              ) : (
                `— · ${period}`
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
