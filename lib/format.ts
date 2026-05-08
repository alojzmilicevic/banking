// Shared formatters. Keep server- and client-safe (pure functions, no DOM).

export function fmtMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
  opts: { decimals?: number } = {},
): string {
  if (amount == null) return '—'
  const decimals = opts.decimals ?? 0
  try {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: currency || 'SEK',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount)
  } catch {
    const factor = 10 ** decimals
    const rounded = Math.round(amount * factor) / factor
    return `${rounded.toLocaleString('sv-SE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })} ${currency ?? ''}`.trim()
  }
}

// Provider product codes are SCREAMING_SNAKE_CASE — fine for the DB but
// they crowd the sidebar at small widths. Map to the conventional Swedish
// abbreviations users actually recognize. Unknown codes pass through so
// nothing silently disappears.
const PRODUCT_LABEL: Record<string, string> = {
  // Avanza
  INVESTERINGSSPARKONTO: 'ISK',
  AKTIEFONDKONTO: 'AF',
  KAPITALFORSAKRING: 'KF',
  KAPITAL_PENSION: 'KP',
  TJANSTEPENSION: 'TJP',
  IPS: 'IPS',
  PPM: 'PPM',
  SPARKONTO: 'Spar',
  CREDIT_ACCOUNT: 'Credit',
  // EB common types
  CACC: 'BK',
  SVGS: 'Spar',
  CARD: 'Card',
}

export function shortProduct(product: string | null | undefined): string | null {
  if (!product) return null
  return PRODUCT_LABEL[product.toUpperCase()] ?? product
}

// Sidebar/chip-tight formatter: "570k", "1.2M", "850". Currency intentionally
// dropped — these slots have a single-currency context (SEK) and need to fit
// in narrow rails where "570 669 kr" doesn't.
export function fmtMoneyCompact(amount: number | null | undefined): string {
  if (amount == null) return '—'
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1_000)}k`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}k`
  return `${sign}${Math.round(abs)}`
}
