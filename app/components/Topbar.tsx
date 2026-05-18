// Top of the main panel — the small label, the big number, the +delta
// pill, and the period pills on the right.
//
// `label` resolves in the parent (HomeContent) since holders are dynamic
// now — Topbar doesn't need to know how to map a view key to a name.

import { Money, Sensitive } from '@/components/sensitive-data'
import { ChangePill, type ChangeValue } from './ChangePill'
import { ChangeModeToggle, type ChangeMode } from './ChangeModeToggle'
import { PeriodTabs, type Period } from './PeriodTabs'

export function Topbar({
  label,
  total,
  change,
  currency,
  period,
  onPeriodChange,
  changeMode,
  onChangeModeChange,
}: {
  label: string
  total: number | null
  change: ChangeValue | null
  currency: string | null
  period: Period
  onPeriodChange: (p: Period) => void
  changeMode: ChangeMode
  onChangeModeChange: (m: ChangeMode) => void
}) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-background px-7 py-4">
      <div>
        <div className="mb-1 text-11 font-medium uppercase tracking-eyebrow text-text-faint">
          {label}
        </div>
        <Sensitive className="flex items-end gap-2">
          <span className="font-mono text-30 font-normal tracking-hero text-foreground tabular-nums">
            {/* `text-right` pins the value to the right edge of Money's
                fixed 13ch slot — without it, "1 251 444 kr" leaves trailing
                whitespace inside its slot, which reads as a wider visual
                gap between the total and the change pill. */}
            <Money amount={total} currency={currency} className="text-right" />
          </span>
          <ChangePill change={change} variant="hero" currency={currency} />
        </Sensitive>
      </div>

      <div className="flex items-center gap-2">
        <ChangeModeToggle value={changeMode} onChange={onChangeModeChange} />
        <PeriodTabs value={period} onChange={onPeriodChange} />
      </div>
    </div>
  )
}
