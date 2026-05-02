// Picking the "best" balance row out of the multiple types a provider can
// return for a single account (Avanza gives totalBalance + cash; EB gives
// closingBooked + interimBooked + …). Single source of truth for the
// preference order so the dashboard sum, the snapshot rebuild, and the
// per-account API all agree on which number to surface.

export const BALANCE_PREFERENCE = [
  'totalBalance',
  'ownCapital',
  'closingBooked',
  'CLBD',
  'interimBooked',
  'ITBD',
  'expected',
  'XPCD',
  'interimAvailable',
  'ITAV',
  'forwardAvailable',
  'FWAV',
  'openingBooked',
  'OPBD',
  'cash',
] as const

export function pickBalance<T extends { balanceType: string }>(rows: T[]): T | null {
  if (rows.length === 0) return null
  for (const t of BALANCE_PREFERENCE) {
    const m = rows.find((r) => r.balanceType === t)
    if (m) return m
  }
  return rows[0]
}

// `totalBalance` and `ownCapital` already include securities valuation, so
// callers must not add positions on top — they'd double-count.
export function balanceIncludesInvestments(balanceType: string): boolean {
  return balanceType === 'totalBalance' || balanceType === 'ownCapital'
}
