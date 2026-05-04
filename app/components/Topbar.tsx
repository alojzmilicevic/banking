// Top of the main panel — the small label, the big number, the +delta
// pill, and the period pills on the right.
//
// `label` resolves in the parent (HomeContent) since holders are dynamic
// now — Topbar doesn't need to know how to map a view key to a name.

import { SensitiveToggle } from '@/components/sensitive-data'
import { BalanceHero } from './BalanceHero'
import { PeriodTabs, type Period } from './PeriodTabs'

export function Topbar({
  label,
  total,
  delta,
  pct,
  currency,
  period,
  onPeriodChange,
}: {
  label: string
  total: number | null
  delta: number | null
  pct: number | null
  currency: string | null
  period: Period
  onPeriodChange: (p: Period) => void
}) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-background px-7 py-4">
      <BalanceHero
        variant="topbar"
        label={label}
        total={total}
        delta={delta}
        pct={pct}
        currency={currency}
        period={period}
      />

      <div className="flex items-center gap-2">
        <SensitiveToggle />
        <PeriodTabs value={period} onChange={onPeriodChange} />
      </div>
    </div>
  )
}
