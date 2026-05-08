// One source of truth for rendering a {absolute, pct} change.
// Used by topbar, summary cards, sidebar group, sidebar account row,
// mobile balance hero, and mobile account row. Owns:
//   - sign + color logic (positive vs negative)
//   - the >500% sanity guard (suppresses pct only — absolute still shows)
//   - empty-state ("— · 1M") when there's no data
//   - abs-vs-pct selection via useChangeMode() (toggle above the chart)
//
// Variant controls visual treatment (size / chip / period suffix). Mode
// — read from context — controls *which* number renders. One bug-fix
// here propagates to every change pill in the app.

import { fmtMoney, fmtMoneyCompact } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import { cn } from '@/lib/utils'
import { useChangeMode } from './change-mode-context'
import type { Period } from './PeriodTabs'

export interface ChangeValue {
  absolute: number
  pct: number | null
}

// Garbage % from divide-by-near-zero (account funded mid-window). Still
// applied as defence in depth even though dashboard.ts now uses the
// today−growth denominator and shouldn't produce these.
const PCT_SANITY_LIMIT = 500

function isPctSane(pct: number | null): pct is number {
  return pct != null && Number.isFinite(pct) && Math.abs(pct) <= PCT_SANITY_LIMIT
}

function fmtPct(pct: number, positive: boolean): string {
  return `${positive ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`
}

function fmtAbs(
  absolute: number,
  currency: string | null,
  compact: boolean,
  positive: boolean,
): string {
  const sign = positive ? '+' : ''
  if (compact) return `${sign}${fmtMoneyCompact(Math.abs(absolute))}`
  return `${sign}${fmtMoney(absolute, currency)}`
}

// Choose what to display given the current mode. If mode='pct' but the
// pct is null/insane (cash account, dust baseline, etc.), fall back to
// abs so the user gets *something* — silently rendering empty would
// look like the toggle is broken.
function pickDisplay(change: ChangeValue, mode: 'abs' | 'pct'): 'abs' | 'pct' {
  if (mode === 'pct' && isPctSane(change.pct)) return 'pct'
  return 'abs'
}

export type PillVariant =
  // Hero / topbar: large text "+1 013 687 kr" or "+5.2%".
  | 'hero'
  // Filled chip used in mobile balance hero.
  | 'chip'
  // Small filled chip used in mobile account rows.
  | 'chip-sm'
  // Summary card line: "+5.2% · 1M" / "+101k · 1M". Period suffix.
  | 'card'
  // Sidebar group header: compact "+13k" / "+5.2%" — small text.
  | 'compact'
  // Sidebar account row: compact "+5.2%" / "+13k".
  | 'row'

// Variants rendered in narrow rails — abs mode uses fmtMoneyCompact so
// "+1 234 567 kr" doesn't blow out the layout.
const COMPACT_VARIANTS: ReadonlySet<PillVariant> = new Set(['compact', 'row', 'chip-sm'])

export function ChangePill({
  change,
  variant,
  currency = null,
  period,
  className,
}: {
  change: ChangeValue | null
  variant: PillVariant
  currency?: string | null
  // Required for 'card' (renders "+5% · 1M"); ignored otherwise.
  period?: Period
  className?: string
}) {
  const mode = useChangeMode()

  if (!change) {
    if (variant === 'card') {
      return (
        <span className={cn('text-12 text-pos', className)}>
          {`— · ${period ?? ''}`}
        </span>
      )
    }
    return null
  }

  const positive = change.absolute >= 0
  const colorClass = positive ? 'text-pos' : 'text-neg'
  const display = pickDisplay(change, mode)
  const text =
    display === 'pct'
      ? fmtPct(change.pct!, positive)
      : fmtAbs(change.absolute, currency, COMPACT_VARIANTS.has(variant), positive)

  switch (variant) {
    case 'hero':
      return (
        <span className={cn('text-14 font-medium', colorClass, className)}>
          <Sensitive>{text}</Sensitive>
        </span>
      )
    case 'chip':
      return (
        <span
          className={cn(
            'rounded-full px-2.5 py-0.75 text-14 font-semibold',
            positive ? 'bg-pos-bg text-pos' : 'bg-white/6 text-neg',
            className,
          )}
        >
          <Sensitive>{text}</Sensitive>
        </span>
      )
    case 'chip-sm':
      return (
        <span
          className={cn(
            'inline-block rounded-full px-1.75 py-px text-11 font-medium',
            positive ? 'bg-pos-bg text-pos' : 'bg-white/6 text-neg',
            className,
          )}
        >
          <Sensitive>{text}</Sensitive>
        </span>
      )
    case 'card':
      return (
        <span className={cn('text-12', colorClass, className)}>
          <Sensitive>{text}</Sensitive>
          {` · ${period ?? ''}`}
        </span>
      )
    case 'compact':
      return (
        <span className={cn('text-11', colorClass, className)}>
          <Sensitive>{text}</Sensitive>
        </span>
      )
    case 'row':
      return (
        <span className={cn('text-11 leading-none', colorClass, className)}>
          <Sensitive>{text}</Sensitive>
        </span>
      )
  }
}
