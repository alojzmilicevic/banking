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
import { COMBINED_META, holderBg, holderBorder } from '@/lib/holders'
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

export default function SummaryCards({
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
      className="grid shrink-0 gap-[14px]"
      style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}
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
            className="rounded-[14px] border p-[16px_20px]"
            style={{ background: s.bg, borderColor: s.border }}
          >
            <div
              className="mb-[6px] text-[11px] font-medium uppercase tracking-[0.08em]"
              style={{ color: s.color }}
            >
              {s.label}
            </div>
            <div
              className="font-mono text-[24px] font-light text-foreground tabular-nums"
              style={{ letterSpacing: '-0.02em' }}
            >
              {fmtMoney(s.total, currency)}
            </div>
            <div
              className="mt-1 text-[12px]"
              style={{ color: showPct && !positive ? 'var(--color-neg)' : 'var(--color-pos)' }}
            >
              {showPct
                ? `${positive ? '+' : ''}${s.pct!.toFixed(1)}% · ${period}`
                : `— · ${period}`}
            </div>
          </div>
        )
      })}
    </div>
  )
}
