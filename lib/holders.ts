// Household identity constants. Re-imported wherever a Holder needs to
// render with a consistent label / emoji.

import type { Holder } from './api/schemas'

export type LinkerHolder = Exclude<Holder, 'joint'>

// Joint emoji is intentionally blank — components render a `<Users />` icon
// instead so the joint case has its own visual treatment.
export const HOLDER_LABEL: Record<Holder, { label: string; emoji: string }> = {
  alma: { label: 'Alma', emoji: '🌷' },
  alojz: { label: 'Alojz', emoji: '🦊' },
  joint: { label: 'Joint', emoji: '' },
}

export const HOUSEHOLD: LinkerHolder[] = ['alma', 'alojz']
