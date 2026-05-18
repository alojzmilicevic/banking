import { describe, expect, it } from 'vitest'
import { balanceIncludesInvestments, pickBalance } from './balance'

describe('pickBalance', () => {
  it('returns null on empty input', () => {
    expect(pickBalance([])).toBe(null)
  })

  it('returns the singleton row when only one balance is present', () => {
    const row = { balanceType: 'closingBooked', amount: 100, currency: 'SEK' }
    expect(pickBalance([row])).toEqual(row)
  })

  it('prefers totalBalance over everything else', () => {
    const rows = [
      { balanceType: 'cash', amount: 100, currency: 'SEK' },
      { balanceType: 'closingBooked', amount: 200, currency: 'SEK' },
      { balanceType: 'totalBalance', amount: 999, currency: 'SEK' },
    ]
    expect(pickBalance(rows)?.balanceType).toBe('totalBalance')
  })

  it('falls back through the preference list — EB CLBD beats interim', () => {
    const rows = [
      { balanceType: 'interimBooked', amount: 50, currency: 'SEK' },
      { balanceType: 'CLBD', amount: 100, currency: 'SEK' },
    ]
    expect(pickBalance(rows)?.balanceType).toBe('CLBD')
  })

  it('honors closingBooked over CLBD (long form wins when both present)', () => {
    // The preference table lists closingBooked before CLBD — EB-style snake
    // codes are the fallback when the long form is missing.
    const rows = [
      { balanceType: 'CLBD', amount: 1, currency: 'SEK' },
      { balanceType: 'closingBooked', amount: 2, currency: 'SEK' },
    ]
    expect(pickBalance(rows)?.amount).toBe(2)
  })

  it('returns first row when no preferred type matches', () => {
    const rows = [
      { balanceType: 'weirdProviderType', amount: 7, currency: 'SEK' },
      { balanceType: 'anotherUnknown', amount: 99, currency: 'SEK' },
    ]
    expect(pickBalance(rows)?.amount).toBe(7)
  })
})

describe('balanceIncludesInvestments', () => {
  it('is true for the two cumulative types', () => {
    expect(balanceIncludesInvestments('totalBalance')).toBe(true)
    expect(balanceIncludesInvestments('ownCapital')).toBe(true)
  })

  it('is false for cash-only types — callers must add positions on top', () => {
    expect(balanceIncludesInvestments('cash')).toBe(false)
    expect(balanceIncludesInvestments('closingBooked')).toBe(false)
    expect(balanceIncludesInvestments('CLBD')).toBe(false)
    expect(balanceIncludesInvestments('interimBooked')).toBe(false)
  })
})
