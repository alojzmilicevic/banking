// Non-holder accent presets used by the dashboard layout. Per-holder
// metadata (label, color, initials) lives in the DB now and arrives via
// the dashboard API; only the bucket-level "Combined" / "Shared" pills
// remain as static config.

export interface HolderMeta {
  label: string
  initials: string
  // Resolved CSS color string for inline styles / SVG fills.
  color: string
  // Backgrounds / borders for chips, person sections, summary cards.
  bg: string
  border: string
}

// "All Accounts" view — shares the indigo accent so the topbar / summary
// cards / view switcher can render it uniformly with per-person entries.
export const COMBINED_META: HolderMeta = {
  label: 'All Accounts',
  initials: 'AA',
  color: 'oklch(65% 0.18 265)',
  bg: 'oklch(65% 0.18 265 / 0.12)',
  border: 'oklch(65% 0.18 265 / 0.30)',
}

// "Shared" — accounts whose IBAN appears under multiple holders, or
// whose connection is explicitly linked to >1 holder. Picked rose/pink
// at hue 350 so it's clearly distinct from red (~25), yellow (~80), and
// the other person colors already in the palette.
export const SHARED_META: HolderMeta = {
  label: 'Shared',
  initials: 'SH',
  color: 'oklch(72% 0.15 350)',
  bg: 'oklch(60% 0.16 350 / 0.14)',
  border: 'oklch(60% 0.16 350 / 0.30)',
}

// Lighten + tint helpers so a holder row's `color` (returned by the API)
// can drive bg/border in the same way the static SHARED_META does.
//
// Holder rows arrive with a single `color` (oklch). We derive bg/border
// at render time so the API contract stays minimal — adding a holder
// means setting one color, not three.
export function holderBg(color: string): string {
  return color.replace(/\)$/, ' / 0.14)')
}
export function holderBorder(color: string): string {
  return color.replace(/\)$/, ' / 0.30)')
}
export function holderTint(color: string): string {
  return color.replace(/\)$/, ' / 0.25)')
}
export function holderAvatarBg(color: string): string {
  return color.replace(/\)$/, ' / 0.20)')
}

// Default palette for newly-added holders. Hues picked to be visually
// distinct from each other and from SHARED_META (350). Cycles back to
// the start when exhausted; collisions are tolerated since Settings
// lets the user re-pick if needed (future feature).
const HOLDER_PALETTE = [
  'oklch(65% 0.18 265)', // blue (default first)
  'oklch(70% 0.16 30)', // orange
  'oklch(70% 0.16 145)', // green
  'oklch(72% 0.14 200)', // cyan
  'oklch(80% 0.14 80)', // amber
  'oklch(70% 0.15 320)', // magenta
] as const

// Pick a palette colour not already used by any of the holders passed
// in. Falls back to cycling through the palette if all six are taken.
export function pickHolderColor(usedColors: readonly string[]): string {
  const used = new Set(usedColors)
  for (const c of HOLDER_PALETTE) {
    if (!used.has(c)) return c
  }
  return HOLDER_PALETTE[usedColors.length % HOLDER_PALETTE.length]
}

// Derive a 2-character initial set from a label. Strips non-letters,
// uppercases, and falls back to "??" for empty input.
export function deriveInitials(label: string): string {
  const cleaned = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '')
  if (cleaned.length === 0) return '??'
  return cleaned.slice(0, 2).toUpperCase()
}
