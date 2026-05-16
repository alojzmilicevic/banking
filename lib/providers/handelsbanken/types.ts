// Shape of the JSON returned by
// GET https://secure.handelsbanken.se/splaa/spla/bu/customers/v3/me/directsavingfunds
//
// Only the fields we actually consume are typed. Everything else on the
// response is ignored.

export interface HbMoney {
  amount: string // "780,00" — comma decimal, sv-SE format
  amountRaw: number // 780
  isoCurrencyCode: string // "SEK"
  roundedAmountRaw?: number
}

export interface HbAccountNumber {
  value: string // "565 842 005" — display
  valueRaw: string // "565842005" — digits only
}

export interface HbFundHolding {
  accountNumber: HbAccountNumber
  isin: string
  name: string
  holdingsCount: string // "5,6996" — comma decimal
  isoCurrencyCode: string
  marketValue: HbMoney
  purchaseValue: HbMoney
  latestMarketPriceValue?: HbMoney
  latestMarketPriceValueDate?: string // YYYY-MM-DD
}

export interface HbDirectSavingFundsResponse {
  customerInfo: { isoCurrencyCode: string }
  directSavingFundHoldings: HbFundHolding[]
  summary?: unknown
}

// ── /splaa/spla/bu/investments/v1/own/holdings-overview ──────────────
// Master account list — used to discover each ISK's
// arPrimaryIdentifier before iterating their summary endpoints.

export interface HbHoldingOverviewItem {
  accountName: string
  accountNumber: string // shorter form, no 1288 prefix
  arPrimaryIdentifier: string // 14 digits, used as ?accountNumber=… on the page URL
  pdName: string // 'ISK-depå' for ISKs
  pdNumber: string
  holdingValues: { currentValueRaw: number }
}

export interface HbDirectSavingsOverview {
  holdingValues: { currentValueRaw: number }
  marketValueForHoldingsCountIncomplete: boolean
}

export interface HbHoldingsOverviewResponse {
  currentValueRaw: number
  holdingValues: { currentValueRaw: number }
  holdingOverviews: HbHoldingOverviewItem[]
  directSavingsOverview?: HbDirectSavingsOverview
  owner?: { name: string; primaryIdentifier: string }
}

// ── /splaa/spla/bu/investmentaccount/holding/isk/v1/summary ───────────
// Per-ISK detail. fundHoldings[] is what we want; holdings[] is for
// stocks (empty for funds-only ISKs, ignored for now). Summary includes
// availableAmount (cash in the ISK) and totalValue (cash + securities).

export interface HbIskFundHolding {
  isin: string
  name: string
  holdingsCount: number // already a JS number (unlike directsavingfunds)
  isoCurrencyCode: string
  marketValue: number // SEK
  purchaseValue: number // SEK
  latestMarketPriceValue?: number
  latestMarketPriceValueDate?: string
  fundAccountNumber?: string
}

export interface HbIskSummaryResponse {
  fundHoldings: HbIskFundHolding[]
  holdings: unknown[] // stocks — out of scope for now
  identifiers: {
    custodyAccountIdentifier: string
    packageArrangementIdentifier: string // == arPrimaryIdentifier
  }
  summary: {
    investmentAccountType: string // 'ISK' | …
    availableAmount: { amount: number; isoCurrencyCode: string }
    totalMarketValue: { amount: number; isoCurrencyCode: string }
    totalValue: { value: number; type: string }
    ownerName: string
  }
}

// ── Combined scrape payload ──────────────────────────────────────────
// Everything one Playwright session captures from a logged-in HB.
// Any sub-piece may be missing (user without ISKs, user without direct
// fund holdings, etc.).

export interface HbScrapeResult {
  overview: HbHoldingsOverviewResponse | null
  iskSummaries: HbIskSummaryResponse[]
  directSavingFunds: HbDirectSavingFundsResponse | null
}
