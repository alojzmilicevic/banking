// Maps Handelsbanken's multi-endpoint scrape → our normalized
// SyncResult. One synthetic investment account holds every fund the
// customer owns across BOTH:
//   • Direct fund savings (Fondkonto, /directsavingfunds)
//   • Funds inside ISKs (/isk/v1/summary fundHoldings[])
// Plus the cash sitting idle inside ISKs (availableAmount) — folded
// into the account's totalBalance so the dashboard total matches what
// HB shows.
//
// Why a single synthetic account: HB exposes per-portfolio accounts in
// its own UI, but our wealth dashboard is fine with one bucket per
// provider per holder. We keep per-fund granularity at the position
// level (one position per ISIN with summed quantity across sources).

import type {
  NormalizedAccount,
  NormalizedBalance,
  NormalizedInstrument,
  NormalizedPosition,
  SyncResult,
} from '../types'
import type {
  HbDirectSavingFundsResponse,
  HbIskSummaryResponse,
  HbScrapeResult,
} from './types'

export const HB_PROVIDER_ID = 'handelsbanken'

export function hbAccountId(connectionId: string): string {
  return `hb-funds-${connectionId}`
}

// "5,6996" → 5.6996. Direct-fund-savings serializes holdingsCount as a
// sv-SE string; ISK summary uses a JS number already.
function parseSeDecimal(s: string): number {
  return Number(s.replace(/\s/g, '').replace(',', '.'))
}

interface FundEntry {
  isin: string
  name: string
  currency: string
  quantity: number
  marketValue: number
  purchaseValue: number | null
}

function fromDirectFunds(r: HbDirectSavingFundsResponse): FundEntry[] {
  return r.directSavingFundHoldings.map((h) => ({
    isin: h.isin,
    name: h.name,
    currency: h.isoCurrencyCode,
    quantity: parseSeDecimal(h.holdingsCount),
    marketValue: h.marketValue.amountRaw,
    purchaseValue: h.purchaseValue?.amountRaw ?? null,
  }))
}

function fromIsk(r: HbIskSummaryResponse): FundEntry[] {
  return r.fundHoldings.map((h) => ({
    isin: h.isin,
    name: h.name,
    currency: h.isoCurrencyCode,
    quantity: h.holdingsCount,
    marketValue: h.marketValue,
    purchaseValue: h.purchaseValue ?? null,
  }))
}

// Sums duplicate ISINs (same fund held in multiple ISKs). Quantities
// add, market values add, purchase values add. avgCost is recomputed
// from the merged totals.
function mergeByIsin(entries: FundEntry[]): FundEntry[] {
  const byIsin = new Map<string, FundEntry>()
  for (const e of entries) {
    const prev = byIsin.get(e.isin)
    if (!prev) {
      byIsin.set(e.isin, { ...e })
      continue
    }
    prev.quantity += e.quantity
    prev.marketValue += e.marketValue
    if (prev.purchaseValue != null && e.purchaseValue != null) {
      prev.purchaseValue += e.purchaseValue
    } else if (prev.purchaseValue == null) {
      prev.purchaseValue = e.purchaseValue
    }
  }
  return Array.from(byIsin.values())
}

export function normalizeHandelsbanken(
  connectionId: string,
  scrape: HbScrapeResult,
  syncWindow: { from: string; to: string },
): SyncResult {
  const accountId = hbAccountId(connectionId)

  // Collect fund holdings from every source.
  const allEntries: FundEntry[] = []
  if (scrape.directSavingFunds) allEntries.push(...fromDirectFunds(scrape.directSavingFunds))
  for (const isk of scrape.iskSummaries) allEntries.push(...fromIsk(isk))
  const funds = mergeByIsin(allEntries)

  // Pick a currency. Use whatever the data reports; fall back to SEK.
  const currency =
    funds[0]?.currency ??
    scrape.directSavingFunds?.customerInfo.isoCurrencyCode ??
    scrape.iskSummaries[0]?.summary.availableAmount.isoCurrencyCode ??
    'SEK'

  const account: NormalizedAccount = {
    id: accountId,
    kind: 'investment',
    name: null,
    details: 'Handelsbanken',
    product: 'HB_HOLDINGS',
    accountType: 'FUND',
    currency,
    iban: null,
    bban: null,
    bic: null,
  }

  const instruments: NormalizedInstrument[] = []
  const positions: NormalizedPosition[] = []
  let fundsMarketValueTotal = 0

  for (const f of funds) {
    const avgCost = f.purchaseValue != null && f.quantity > 0 ? f.purchaseValue / f.quantity : null

    instruments.push({
      id: f.isin,
      type: 'FUND',
      name: f.name,
      isin: f.isin,
      currency: f.currency,
      providerId: HB_PROVIDER_ID,
      providerInstrumentId: f.isin,
    })

    positions.push({
      accountId,
      instrumentId: f.isin,
      quantity: f.quantity,
      avgCost,
      marketValue: f.marketValue,
      currency: f.currency,
    })

    fundsMarketValueTotal += f.marketValue
  }

  // Cash sitting idle inside ISKs. The FOND side has no cash component
  // — it's pure fund holdings. Sum across all ISKs.
  const iskCashTotal = scrape.iskSummaries.reduce(
    (s, isk) => s + (isk.summary.availableAmount?.amount ?? 0),
    0,
  )

  // totalBalance = funds + ISK cash. Tagged 'totalBalance' so the
  // snapshot builder treats it as cash-plus-securities and doesn't
  // double-count by adding positions on top.
  const balances: NormalizedBalance[] = [
    {
      accountId,
      balanceType: 'totalBalance',
      amount: fundsMarketValueTotal + iskCashTotal,
      currency,
      referenceDate: null,
    },
  ]

  return {
    accounts: [account],
    balances,
    transactions: [],
    instruments,
    positions,
    syncWindow,
  }
}
