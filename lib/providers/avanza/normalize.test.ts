import { describe, expect, it } from 'vitest'
import {
  normalizeAccount,
  normalizeBalances,
  type AvanzaCategorizedAccount,
} from './normalize'

const baseAccount: AvanzaCategorizedAccount = {
  id: '12345',
  urlParameterId: 'abc-def',
  type: 'INVESTERINGSSPARKONTO',
  name: { defaultName: '12345', userDefinedName: 'My ISK' },
  balance: { value: 100, unit: 'SEK', unitType: 'MONETARY', decimalPrecision: 2 },
  totalValue: { value: 5000, unit: 'SEK', unitType: 'MONETARY', decimalPrecision: 2 },
  status: 'ACTIVE',
}

describe('normalizeAccount', () => {
  it('maps ISK → investment kind', () => {
    expect(normalizeAccount(baseAccount).kind).toBe('investment')
  })

  it('maps SPARKONTO → cash kind', () => {
    expect(normalizeAccount({ ...baseAccount, type: 'SPARKONTO' }).kind).toBe('cash')
  })

  it('maps TJANSTEPENSION → pension kind', () => {
    expect(normalizeAccount({ ...baseAccount, type: 'TJANSTEPENSION' }).kind).toBe('pension')
  })

  it('unknown types default to investment (Avanza is investment-first)', () => {
    expect(normalizeAccount({ ...baseAccount, type: 'NEW_FUTURE_TYPE' }).kind).toBe('investment')
  })

  it('prefers user-defined name over default name', () => {
    expect(normalizeAccount(baseAccount).details).toBe('My ISK')
  })

  it('falls back to defaultName when userDefinedName is null', () => {
    expect(
      normalizeAccount({
        ...baseAccount,
        name: { defaultName: '12345', userDefinedName: null },
      }).details,
    ).toBe('12345')
  })

  it('falls back to defaultName when userDefinedName is empty string', () => {
    expect(
      normalizeAccount({
        ...baseAccount,
        name: { defaultName: '12345', userDefinedName: '   ' },
      }).details,
    ).toBe('12345')
  })

  it('preserves the full raw payload', () => {
    expect(normalizeAccount(baseAccount).raw).toBe(baseAccount)
  })

  it('clearingAccountNumber maps to bban', () => {
    expect(
      normalizeAccount({ ...baseAccount, clearingAccountNumber: '9554-1894850' }).bban,
    ).toBe('9554-1894850')
  })
})

describe('normalizeBalances', () => {
  it('emits both cash and totalBalance rows', () => {
    const out = normalizeBalances(baseAccount)
    const types = out.map((b) => b.balanceType).sort()
    expect(types).toEqual(['cash', 'totalBalance'])
  })

  it('cash balance carries the bare cash component', () => {
    const cash = normalizeBalances(baseAccount).find((b) => b.balanceType === 'cash')
    expect(cash?.amount).toBe(100)
    expect(cash?.currency).toBe('SEK')
  })

  it('totalBalance carries the cash + securities aggregate', () => {
    const total = normalizeBalances(baseAccount).find((b) => b.balanceType === 'totalBalance')
    expect(total?.amount).toBe(5000)
  })

  it('omits cash row when balance is missing', () => {
    const out = normalizeBalances({
      ...baseAccount,
      balance: undefined as unknown as AvanzaCategorizedAccount['balance'],
    })
    expect(out.find((b) => b.balanceType === 'cash')).toBeUndefined()
  })

  it('omits totalBalance row when totalValue is missing', () => {
    const out = normalizeBalances({
      ...baseAccount,
      totalValue: undefined as unknown as AvanzaCategorizedAccount['totalValue'],
    })
    expect(out.find((b) => b.balanceType === 'totalBalance')).toBeUndefined()
  })

  it('handles zero balances (empty accounts)', () => {
    const empty = {
      ...baseAccount,
      balance: { value: 0, unit: 'SEK', unitType: 'MONETARY', decimalPrecision: 2 },
      totalValue: { value: 0, unit: 'SEK', unitType: 'MONETARY', decimalPrecision: 2 },
    }
    const out = normalizeBalances(empty)
    expect(out).toHaveLength(2)
    expect(out.every((b) => b.amount === 0)).toBe(true)
  })
})
