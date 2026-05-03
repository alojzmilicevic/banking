'use client'
// The trio of cards at the bottom of the main panel:
//   ┌────────────┐ ┌────────────┐ ┌────────────┐
//   │ COMBINED   │ │  ALOJZ     │ │  ALMA      │
//   │ €X         │ │ €Y         │ │ €Z         │
//   │ +1.2% · 1Y │ │ +2.1% · 1Y │ │ +0.5% · 1Y │
//   └────────────┘ └────────────┘ └────────────┘

import { fmtMoney } from '@/lib/format'
import { COMBINED_META, HOLDER_LABEL } from '@/lib/holders'
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
  totalAlojz,
  totalAlma,
  pctAll,
  pctAlojz,
  pctAlma,
}: {
  totalAll: number
  totalAlojz: number
  totalAlma: number
  pctAll: number | null
  pctAlojz: number | null
  pctAlma: number | null
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
    {
      label: HOLDER_LABEL.alojz.label,
      total: totalAlojz,
      pct: pctAlojz,
      color: HOLDER_LABEL.alojz.color,
      bg: HOLDER_LABEL.alojz.bg,
      border: HOLDER_LABEL.alojz.border,
    },
    {
      label: HOLDER_LABEL.alma.label,
      total: totalAlma,
      pct: pctAlma,
      color: HOLDER_LABEL.alma.color,
      bg: HOLDER_LABEL.alma.bg,
      border: HOLDER_LABEL.alma.border,
    },
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
  return (
    <div className="grid shrink-0 grid-cols-3 gap-[14px]">
      {rows.map((s) => {
        const positive = (s.pct ?? 0) >= 0
        // Suppress garbage % when the baseline was effectively zero (early
        // days of tracking → divide-by-near-zero → 3000%+ noise). Same
        // guard as the topbar; > ±500% is almost certainly a tiny base
        // getting funded, not real growth.
        const showPct =
          s.pct != null && Number.isFinite(s.pct) && Math.abs(s.pct) <= 500
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
