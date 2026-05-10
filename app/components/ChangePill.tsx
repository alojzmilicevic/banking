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
import { Mask } from '@/components/sensitive-data'
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

// Filled-chip variants color the background; the rest only color the text.
const CHIP_VARIANTS: ReadonlySet<PillVariant> = new Set(['chip', 'chip-sm'])

const VARIANT_CLASSES: Record<PillVariant, string> = {
  hero: 'inline-block text-18 font-medium tabular-nums',
  chip: 'inline-block text-right rounded-full px-2.5 py-0.75 text-14 font-semibold tabular-nums',
  'chip-sm': 'inline-block rounded-full px-1.75 py-px text-11 font-medium tabular-nums',
  card: 'text-12 tabular-nums',
  compact: 'inline-block text-right text-11 tabular-nums',
  row: 'text-11 leading-none tabular-nums',
}

// Fixed slot width per variant. Constant across all instances of the
// same variant means peek doesn't reflow (mask and real both fit) and
// the slot itself can't betray magnitude. Sized to fit the largest
// expected real value at that variant's font scale (in ch units, so
// the size scales with `text-*`). Used alongside text-right so the
// peek-shift stays anchored to the right edge of the slot.
const VARIANT_SLOTS: Record<PillVariant, number> = {
  hero: 13,
  chip: 14,
  'chip-sm': 9,
  card: 14,
  compact: 9,
  row: 9,
}

// Hard width (`w-[Nch]`), not min-width — bullets and "kr" are not
// covered by tabular-nums, so a min-width slot grows slightly above N
// while masked and snaps back on reveal (visible jump on toggle).
const VARIANT_SLOT_CLASSES: Record<PillVariant, string> = {
  hero: 'w-[13ch]',
  chip: 'w-[14ch]',
  'chip-sm': 'w-[9ch]',
  card: 'w-[14ch]',
  compact: 'w-[9ch]',
  row: 'w-[9ch]',
}

function toneClasses(variant: PillVariant, positive: boolean): string {
  if (CHIP_VARIANTS.has(variant)) {
    return positive ? 'bg-pos-bg text-pos' : 'bg-white/6 text-neg'
  }
  return positive ? 'text-pos' : 'text-neg'
}

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

  const slotCh = VARIANT_SLOTS[variant]
  const slotClass = VARIANT_SLOT_CLASSES[variant]

  if (!change) {
    if (variant === 'card') {
      return (
        <span className={cn(VARIANT_CLASSES.card, slotClass, 'text-pos', className)}>
          {`— · ${period ?? ''}`}
        </span>
      )
    }
    // No data — render a placeholder so rows with and without growth
    // data don't look layout-different (e.g. a holder whose only
    // account is a cash account vs one with investments). Green to
    // match positive change visually; revealed it shows "—".
    return (
      <span
        className={cn(
          VARIANT_CLASSES[variant],
          slotClass,
          toneClasses(variant, true),
          className,
        )}
      >
        <Mask value="—" unit=" kr" bullets={slotCh} hideMaskedUnit />
      </span>
    )
  }

  const positive = change.absolute >= 0
  const display = pickDisplay(change, mode)
  const text =
    display === 'pct'
      ? fmtPct(change.pct!, positive)
      : fmtAbs(change.absolute, currency, COMPACT_VARIANTS.has(variant), positive)

  // Pct → "%", abs → " kr". Unit is only used when revealed (it's part
  // of `text`); when masked we render bullets only via `hideMaskedUnit`,
  // so the green pill stays visually quiet ("•••••" not "••• kr").
  const unit = display === 'pct' ? '%' : ' kr'
  // Bullets fill the whole slot since there's no unit suffix on mask.
  const bullets = slotCh

  return (
    <span
      className={cn(
        VARIANT_CLASSES[variant],
        slotClass,
        toneClasses(variant, positive),
        className,
      )}
    >
      <Mask value={text} unit={unit} bullets={bullets} hideMaskedUnit />
      {variant === 'card' && ` · ${period ?? ''}`}
    </span>
  )
}
