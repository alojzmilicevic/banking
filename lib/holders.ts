// Household identity constants. Re-imported wherever a Holder needs to
// render with a consistent label / initials / person accent color.

import type { Holder } from './api/schemas'

export type LinkerHolder = Exclude<Holder, 'joint'>

export interface HolderMeta {
  label: string
  initials: string
  // Resolved CSS color string for inline styles / SVG fills.
  color: string
  // Backgrounds / borders for chips, person sections, summary cards.
  bg: string
  border: string
}

export const HOLDER_LABEL: Record<Holder, HolderMeta> = {
  alojz: {
    label: 'Alojz',
    initials: 'AM',
    color: 'oklch(70% 0.13 195)',
    bg: 'oklch(60% 0.14 195 / 0.14)',
    border: 'oklch(60% 0.14 195 / 0.30)',
  },
  alma: {
    label: 'Alma',
    initials: 'AC',
    color: 'oklch(70% 0.16 300)',
    bg: 'oklch(61% 0.16 300 / 0.14)',
    border: 'oklch(61% 0.16 300 / 0.30)',
  },
  joint: {
    label: 'Joint',
    initials: 'JT',
    color: 'oklch(65% 0.18 265)',
    bg: 'oklch(65% 0.18 265 / 0.14)',
    border: 'oklch(65% 0.18 265 / 0.30)',
  },
}

export const HOUSEHOLD: LinkerHolder[] = ['alma', 'alojz']

// "All Accounts" view — shares the indigo accent so the topbar / summary
// cards / view switcher can render it uniformly with per-person entries.
export const COMBINED_META: HolderMeta = {
  label: 'All Accounts',
  initials: 'AA',
  color: 'oklch(65% 0.18 265)',
  bg: 'oklch(65% 0.18 265 / 0.12)',
  border: 'oklch(65% 0.18 265 / 0.30)',
}

// "Shared" — accounts whose IBAN appears under both holders. Picked rose/pink
// at hue 350 so it's clearly distinct from red (~25), yellow (~80), and the
// other person colors (teal/violet/indigo/green) already in the palette.
export const SHARED_META: HolderMeta = {
  label: 'Shared',
  initials: 'SH',
  color: 'oklch(72% 0.15 350)',
  bg: 'oklch(60% 0.16 350 / 0.14)',
  border: 'oklch(60% 0.16 350 / 0.30)',
}
