'use client'
// Hide-sensitive-data primitives. A switch toggles a global "hide" flag
// (persisted to localStorage). <Sensitive> wraps a number group and
// owns the peek-on-press behaviour; <Mask> renders the actual string,
// swapping digits for • bullets while the group is hidden. Layout stays
// put because tabular-nums monospaces digits and bullets identically —
// peeking just swaps characters, no width change, no blur smudge.
//
// Default is hidden. SSR always renders hidden so the first paint matches
// no-localStorage clients; useLocalStorage rehydrates the persisted
// choice on mount.

import { Eye, EyeOff } from 'lucide-react'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { IconButton } from '@/components/ui/icon-button'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { fmtMoney, fmtMoneyCompact } from '@/lib/format'
import { cn } from '@/lib/utils'

type Ctx = {
  hidden: boolean
  toggle: () => void
}

const SensitiveDataContext = createContext<Ctx>({
  hidden: true,
  toggle: () => {},
})

// Provides peek state to descendant <Mask> calls. `nested` lets a
// Sensitive inside another Sensitive defer entirely to the outer one —
// otherwise we'd get split peek state and (when CSS blur was used)
// compounded blur. ChangePill carries its own internal Sensitive so it's
// safe-by-default standalone; that no-ops cleanly when a parent groups
// balance + change pill.
type SensitiveState = { blurred: boolean; nested: boolean }
const SensitiveStateContext = createContext<SensitiveState>({
  blurred: false,
  nested: false,
})

const STORAGE_KEY = 'aloma:hide-sensitive'

export function SensitiveDataProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useLocalStorage<boolean>(STORAGE_KEY, true)

  function toggle() {
    setHidden((v) => !v)
  }

  return (
    <SensitiveDataContext.Provider value={{ hidden, toggle }}>
      {children}
    </SensitiveDataContext.Provider>
  )
}

export function useSensitiveData(): Ctx {
  return useContext(SensitiveDataContext)
}

export function Sensitive({ children, className }: { children: ReactNode; className?: string }) {
  const { hidden } = useSensitiveData()
  const outer = useContext(SensitiveStateContext)
  const [peeking, setPeeking] = useState(false)

  // Inside another Sensitive, defer entirely — the outer owns peek for
  // the whole group. Drop className too; outer owns layout.
  if (outer.nested) return <>{children}</>

  const blurred = hidden && !peeking

  return (
    <SensitiveStateContext.Provider value={{ blurred, nested: true }}>
      <span
        className={cn(
          // Pseudo-element extends the pointer hit area ~4px beyond the
          // text box without affecting layout — peek is finicky on small
          // numbers.
          "relative inline-block before:absolute before:-inset-1 before:content-['']",
          hidden && 'cursor-pointer touch-none select-none',
          className,
        )}
        onPointerDown={(e) => {
          if (!hidden) return
          // Don't open the underlying account row / button — the user is
          // peeking the number, not clicking the parent.
          e.stopPropagation()
          // Capture the pointer so this element keeps receiving events
          // even after revealing shrinks the wrapper out from under the
          // cursor (mask "•••••• kr" is wider than e.g. "0 kr"). Without
          // capture, `pointerleave` would fire the instant we unmask,
          // ending the peek and re-shrinking — a flicker loop.
          e.currentTarget.setPointerCapture(e.pointerId)
          setPeeking(true)
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId)
          setPeeking(false)
        }}
        onPointerCancel={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId)
          setPeeking(false)
        }}
        onClick={(e) => {
          if (hidden) e.stopPropagation()
        }}
      >
        {children}
      </span>
    </SensitiveStateContext.Provider>
  )
}

// Default bullet count when callers don't specify. Most callers DO
// specify via <Money>/<ChangePill>, sized to fill their slot — a
// half-empty slot betrays magnitude ("the real value is much wider
// than the bullets"). Variable length would leak too (1 bullet ≈ "0").
const DEFAULT_BULLETS = 6
const DIGIT_RX = /\p{N}/u

// Sign characters we strip from the prefix when masked: ASCII +, ASCII
// hyphen-minus, and U+2212 minus (what Intl.NumberFormat and our fmtPct
// emit). Leaving the sign in would leak whether the change is up or down.
const SIGN_RX = /[+\-−]/g

// Bullets ride at x-height/midline in most fonts. Don't apply a negative
// vertical-align to "nudge them toward digit center" — that pushes the
// bullet below baseline and extends the line-box downward, which makes
// the wrapping span ~0.12em taller while masked. With `flex items-end`
// (e.g. the topbar), the bottom-anchored layout then jumps vertically
// on peek. Leaving vertical-align at baseline keeps the line-box height
// constant across mask/reveal — no jump.
function MaskedBullets({ count }: { count: number }) {
  return <span aria-hidden>{'•'.repeat(count)}</span>
}

function renderMasked(value: string, unit?: string, bullets = DEFAULT_BULLETS): ReactNode {
  // Caller-supplied unit always wins — guarantees money values render
  // as "•••••• kr" even when the source string is "—" or has a compact
  // suffix like "999"/"1.2M".
  if (unit !== undefined) {
    return (
      <>
        <MaskedBullets count={bullets} />
        {unit}
      </>
    )
  }

  const firstIdx = value.search(DIGIT_RX)
  // No digits and no unit — return as-is so placeholders like '—' pass
  // through unchanged.
  if (firstIdx === -1) return value

  let lastIdx = value.length - 1
  while (!DIGIT_RX.test(value[lastIdx])) lastIdx--

  // Drop sign chars from the prefix; preserve currency symbols ($, €, …)
  // if a locale puts them up front.
  const prefix = value.slice(0, firstIdx).replace(SIGN_RX, '')
  // Compact format leaks magnitude through the suffix ("k" = thousands,
  // "M" = millions). Swap those for the full currency unit so every
  // hidden money value reads as "kr" regardless of size. Other suffixes
  // (e.g. "%", " kr") pass through.
  let suffix = value.slice(lastIdx + 1)
  if (suffix === 'k' || suffix === 'M') suffix = ' kr'

  return (
    <>
      {prefix}
      <MaskedBullets count={bullets} />
      {suffix}
    </>
  )
}

// Renders a numeric/money string, swapping the digit region for
// `bullets` bullets when an enclosing <Sensitive> group is hidden.
// Outside a Sensitive, falls back to the global hide flag — so a
// stray <Mask> still hides by default rather than leaking the value.
//
// Pass `unit` (e.g. " kr", "%") to force the masked suffix; the masked
// render then ignores whatever suffix the formatted string had. Use
// this for money so a small compact value (`999`) and a million
// (`1.2M`) and a no-data placeholder (`—`) all read as "•••••• kr".
//
// Pass `bullets` to size the bullet run to fill the slot. A half-empty
// slot betrays magnitude ("the real value is much wider than the
// bullets"); filling it removes that signal at the cost of a tiny
// shrink on peek when the real value is shorter. Defaults to 6.
export function Mask({
  value,
  unit,
  bullets,
  hideMaskedUnit = false,
}: {
  value: string
  unit?: string
  bullets?: number
  // When true, the masked render is bullets only — no unit suffix.
  // Revealed render is unchanged. Used by ChangePill to keep the green
  // "+5.2% / +1 234 kr" pill visually quiet when masked (just dots).
  hideMaskedUnit?: boolean
}) {
  const { hidden } = useSensitiveData()
  const outer = useContext(SensitiveStateContext)
  const blurred = outer.nested ? outer.blurred : hidden
  if (!blurred) return <>{value}</>
  if (hideMaskedUnit) return <MaskedBullets count={bullets ?? DEFAULT_BULLETS} />
  return <>{renderMasked(value, unit, bullets)}</>
}

// Canonical money renderer. Encapsulates "format the amount + mask it +
// always show 'kr' as the masked suffix" so callers can't accidentally
// render money without a unit. `null`/`undefined` amounts render as a
// faint em-dash when revealed, matching `•••••• kr` width when masked
// (so rows with and without data don't look layout-different).
//
// The slot is fixed-width per format (13ch full, 9ch compact) AND the
// masked bullet run is sized to fill the slot. Constant slot width
// stops "this row is wider, must be a bigger number" leaks; full-width
// bullets stop "the slot has empty space, the real value is wide"
// leaks. text-right anchors content so peek-shift stays inside the
// slot. A unit-suffix mismatch on peek (e.g. "1 234 567 kr" → "•")
// is impossible because <Mask> always renders "kr" when masked.
//
// Width is locked with `w-[Nch]`, not `min-w-[Nch]`: bullets and "kr"
// are not tabular-nums-covered, so a min-width slot grows slightly
// while masked and snaps back on reveal — a visible jump on toggle.
// Hard width prevents that. Callers needing more room (e.g. decimals=2)
// must override via className with their own `w-[Nch]`.
export function Money({
  amount,
  currency = null,
  compact = false,
  decimals,
  className,
}: {
  amount: number | null | undefined
  currency?: string | null
  compact?: boolean
  decimals?: number
  className?: string
}) {
  const value =
    amount == null
      ? '—'
      : compact
        ? fmtMoneyCompact(amount)
        : fmtMoney(amount, currency, decimals != null ? { decimals } : undefined)
  // 13ch fits up to "1 234 567 kr"; 9ch fits any compact value plus
  // " kr". Override via className for outliers (e.g. /account uses
  // decimals=2 → wider).
  const slot = compact ? 'w-[9ch]' : 'w-[13ch]'
  // Fill the slot: bullets = slotCh - " kr".length (3).
  const bullets = compact ? 6 : 10
  return (
    <span className={cn('inline-block tabular-nums', slot, className)}>
      <Mask value={value} unit=" kr" bullets={bullets} />
    </span>
  )
}

export function SensitiveToggle({ className }: { className?: string }) {
  const { hidden, toggle } = useSensitiveData()
  const Icon = hidden ? EyeOff : Eye
  return (
    <IconButton
      onClick={toggle}
      aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
      title={hidden ? 'Show amounts' : 'Hide amounts'}
      aria-pressed={hidden}
      className={className}
    >
      <Icon className="size-4.5" />
    </IconButton>
  )
}
