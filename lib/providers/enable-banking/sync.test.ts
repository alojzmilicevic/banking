import { describe, expect, it } from 'vitest'
import { classifyTransaction, signedAmount } from './sync'
import type { EBTransaction } from './api'

const tx = (overrides: Partial<EBTransaction>): EBTransaction => ({
  transaction_amount: { amount: '0', currency: 'SEK' },
  ...overrides,
})

describe('signedAmount', () => {
  it('debit becomes negative regardless of amount sign', () => {
    expect(
      signedAmount(
        tx({
          transaction_amount: { amount: '100.50', currency: 'SEK' },
          credit_debit_indicator: 'DBIT',
        }),
      ),
    ).toBe(-100.5)
    expect(
      signedAmount(
        tx({
          transaction_amount: { amount: '-100.50', currency: 'SEK' },
          credit_debit_indicator: 'DBIT',
        }),
      ),
    ).toBe(-100.5)
  })

  it('credit becomes positive regardless of amount sign', () => {
    expect(
      signedAmount(
        tx({
          transaction_amount: { amount: '50.25', currency: 'SEK' },
          credit_debit_indicator: 'CRDT',
        }),
      ),
    ).toBe(50.25)
    expect(
      signedAmount(
        tx({
          transaction_amount: { amount: '-50.25', currency: 'SEK' },
          credit_debit_indicator: 'CRDT',
        }),
      ),
    ).toBe(50.25)
  })

  it('falls back to raw amount when indicator is null/missing', () => {
    expect(
      signedAmount(tx({ transaction_amount: { amount: '42', currency: 'SEK' } })),
    ).toBe(42)
    expect(
      signedAmount(
        tx({ transaction_amount: { amount: '-42', currency: 'SEK' } }),
      ),
    ).toBe(-42)
  })

  it('returns 0 for non-numeric amounts', () => {
    expect(
      signedAmount(tx({ transaction_amount: { amount: 'foo', currency: 'SEK' } })),
    ).toBe(0)
  })

  it('handles zero (-0 from DBIT collapses to 0 in arithmetic)', () => {
    const v = signedAmount(
      tx({
        transaction_amount: { amount: '0', currency: 'SEK' },
        credit_debit_indicator: 'DBIT',
      }),
    )
    // -Math.abs(0) is -0 in JS — fine since 0 === -0 in arithmetic.
    expect(v + 1).toBe(1)
  })

  it('preserves decimal precision', () => {
    expect(
      signedAmount(
        tx({
          transaction_amount: { amount: '1234.567', currency: 'SEK' },
          credit_debit_indicator: 'DBIT',
        }),
      ),
    ).toBe(-1234.567)
  })
})

describe('classifyTransaction', () => {
  it('positive amounts are cash_in', () => {
    expect(classifyTransaction(100)).toBe('cash_in')
    expect(classifyTransaction(0.01)).toBe('cash_in')
  })

  it('negative amounts are cash_out', () => {
    expect(classifyTransaction(-100)).toBe('cash_out')
    expect(classifyTransaction(-0.01)).toBe('cash_out')
  })

  it('zero is cash_in (boundary case)', () => {
    expect(classifyTransaction(0)).toBe('cash_in')
  })
})
