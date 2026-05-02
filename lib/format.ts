// Shared formatters. Keep server- and client-safe (pure functions, no DOM).

export function fmtMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount == null) return '—'
  try {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: currency || 'SEK',
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${Math.round(amount).toLocaleString('sv-SE')} ${currency ?? ''}`.trim()
  }
}
