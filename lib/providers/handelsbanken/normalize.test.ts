import { describe, expect, it } from 'vitest'
import { normalizeHandelsbanken, hbAccountId } from './normalize'
import type {
  HbDirectSavingFundsResponse,
  HbIskSummaryResponse,
  HbScrapeResult,
} from './types'

// Trimmed copy of a real /directsavingfunds response — only the fields
// the normalizer reads. One holding is enough to exercise the math.
const directFundsFixture: HbDirectSavingFundsResponse = {
  customerInfo: { isoCurrencyCode: 'SEK' },
  directSavingFundHoldings: [
    {
      accountNumber: { value: '565 842 005', valueRaw: '565842005' },
      isin: 'SE0009697113',
      name: 'Handelsbanken Fokus 50 (A1 SEK)',
      holdingsCount: '5,6996',
      isoCurrencyCode: 'SEK',
      marketValue: { amount: '825,25', amountRaw: 825.25, isoCurrencyCode: 'SEK' },
      purchaseValue: { amount: '780,00', amountRaw: 780, isoCurrencyCode: 'SEK' },
    },
  ],
}

// Trimmed copy of a real ISK summary — Alma's Framtid with three
// funds + cash. Only fields the normalizer reads are typed strictly.
const iskFixture: HbIskSummaryResponse = {
  fundHoldings: [
    {
      isin: 'SE0000356073',
      name: 'Handelsbanken Asien Tema (A1 SEK)',
      holdingsCount: 42.0858,
      isoCurrencyCode: 'SEK',
      marketValue: 58486.64,
      purchaseValue: 50000,
    },
    {
      isin: 'SE0015382114',
      name: 'Handelsbanken Global Momentum (A1 SEK)',
      holdingsCount: 277.5311,
      isoCurrencyCode: 'SEK',
      marketValue: 59810.73,
      purchaseValue: 50000,
    },
    {
      isin: 'SE0005965662',
      name: 'Handelsbanken Hållbar Energi (A1 SEK)',
      holdingsCount: 127.2751,
      isoCurrencyCode: 'SEK',
      marketValue: 58836.73,
      purchaseValue: 50000,
    },
  ],
  holdings: [],
  identifiers: {
    custodyAccountIdentifier: '1269981832317',
    packageArrangementIdentifier: '12882582816981',
  },
  summary: {
    investmentAccountType: 'ISK',
    availableAmount: { amount: 61000, isoCurrencyCode: 'SEK' },
    totalMarketValue: { amount: 177134.1, isoCurrencyCode: 'SEK' },
    totalValue: { value: 238134.1, type: 'SHOWN' },
    ownerName: 'Alma Cederblad',
  },
}

const window = { from: '2025-05-16', to: '2026-05-16' }

function scrape(parts: Partial<HbScrapeResult>): HbScrapeResult {
  return {
    overview: null,
    iskSummaries: [],
    directSavingFunds: null,
    ...parts,
  }
}

describe('normalizeHandelsbanken — direct fund savings only', () => {
  it('collapses all holdings into one synthetic investment account', () => {
    const r = normalizeHandelsbanken(
      'conn-1',
      scrape({ directSavingFunds: directFundsFixture }),
      window,
    )
    expect(r.accounts).toHaveLength(1)
    expect(r.accounts[0].id).toBe(hbAccountId('conn-1'))
    expect(r.accounts[0].kind).toBe('investment')
  })

  it('emits one instrument + position per ISIN', () => {
    const r = normalizeHandelsbanken(
      'conn-1',
      scrape({ directSavingFunds: directFundsFixture }),
      window,
    )
    expect(r.instruments).toHaveLength(1)
    expect(r.instruments![0].id).toBe('SE0009697113')
    expect(r.positions).toHaveLength(1)
  })

  it('parses sv-SE comma decimals into JS numbers', () => {
    const r = normalizeHandelsbanken(
      'conn-1',
      scrape({ directSavingFunds: directFundsFixture }),
      window,
    )
    expect(r.positions![0].quantity).toBeCloseTo(5.6996, 4)
  })

  it('computes per-unit avg cost from purchase total / units', () => {
    const r = normalizeHandelsbanken(
      'conn-1',
      scrape({ directSavingFunds: directFundsFixture }),
      window,
    )
    expect(r.positions![0].avgCost).toBeCloseTo(780 / 5.6996, 2)
  })

  it('balance row is the summed market value as totalBalance', () => {
    const r = normalizeHandelsbanken(
      'conn-1',
      scrape({ directSavingFunds: directFundsFixture }),
      window,
    )
    expect(r.balances).toHaveLength(1)
    expect(r.balances[0].balanceType).toBe('totalBalance')
    expect(r.balances[0].amount).toBe(825.25)
  })
})

describe('normalizeHandelsbanken — ISK with funds + cash', () => {
  it('emits one position per fund inside the ISK', () => {
    const r = normalizeHandelsbanken('conn-1', scrape({ iskSummaries: [iskFixture] }), window)
    expect(r.positions).toHaveLength(3)
    expect(new Set(r.positions!.map((p) => p.instrumentId))).toEqual(
      new Set(['SE0000356073', 'SE0015382114', 'SE0005965662']),
    )
  })

  it('balance includes ISK cash (availableAmount) on top of fund market value', () => {
    const r = normalizeHandelsbanken('conn-1', scrape({ iskSummaries: [iskFixture] }), window)
    // 58486.64 + 59810.73 + 58836.73 + 61000 cash = 238134.10
    expect(r.balances[0].amount).toBeCloseTo(238134.1, 2)
  })
})

describe('normalizeHandelsbanken — multiple sources merged', () => {
  it('combines direct funds + ISK fund holdings into a single account', () => {
    const r = normalizeHandelsbanken(
      'conn-1',
      scrape({ directSavingFunds: directFundsFixture, iskSummaries: [iskFixture] }),
      window,
    )
    expect(r.accounts).toHaveLength(1)
    expect(r.positions).toHaveLength(4) // 1 direct + 3 ISK
    expect(r.balances[0].amount).toBeCloseTo(825.25 + 238134.1, 2)
  })

  it('sums quantity + market value when the same ISIN appears in multiple sources', () => {
    const dupedIsk: HbIskSummaryResponse = {
      ...iskFixture,
      fundHoldings: [
        {
          isin: 'SE0009697113', // same ISIN as the direct-funds fixture
          name: 'Handelsbanken Fokus 50 (A1 SEK)',
          holdingsCount: 10,
          isoCurrencyCode: 'SEK',
          marketValue: 1447.9,
          purchaseValue: 1400,
        },
      ],
      summary: { ...iskFixture.summary, availableAmount: { amount: 0, isoCurrencyCode: 'SEK' } },
    }
    const r = normalizeHandelsbanken(
      'conn-1',
      scrape({ directSavingFunds: directFundsFixture, iskSummaries: [dupedIsk] }),
      window,
    )
    expect(r.positions).toHaveLength(1)
    expect(r.positions![0].quantity).toBeCloseTo(5.6996 + 10, 4)
    expect(r.positions![0].marketValue).toBeCloseTo(825.25 + 1447.9, 2)
  })
})

describe('normalizeHandelsbanken — empty', () => {
  it('emits zero-balance account when nothing was captured', () => {
    const r = normalizeHandelsbanken('conn-1', scrape({}), window)
    expect(r.accounts).toHaveLength(1)
    expect(r.balances[0].amount).toBe(0)
    expect(r.positions).toHaveLength(0)
  })
})
