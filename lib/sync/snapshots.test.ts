import { describe, expect, it } from 'vitest'
import { computeSnapshotPoints, type AccountSnapshot } from './snapshots'

// Fixed "today" so day arithmetic is deterministic across runs / TZs.
const TODAY = new Date('2026-04-28T00:00:00.000Z')

function snap(over: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    accountId: 'acc1',
    kind: 'cash',
    currency: 'SEK',
    todayAmount: 0,
    balanceIncludesInvestments: false,
    positionsValue: 0,
    txs: [],
    history: new Map(),
    earliestHistoryDate: null,
    ...over,
  }
}

describe('computeSnapshotPoints — shape', () => {
  it('returns daysBack+1 points (inclusive of today)', () => {
    const { points } = computeSnapshotPoints([], TODAY, 7)
    expect(points).toHaveLength(8)
  })

  it('points run from today backward in 1-day steps', () => {
    const { points } = computeSnapshotPoints([], TODAY, 3)
    expect(points.map((p) => p.date)).toEqual([
      '2026-04-28',
      '2026-04-27',
      '2026-04-26',
      '2026-04-25',
    ])
  })

  it('empty snapshots → all zeros, no mismatches', () => {
    const { points, currencyMismatches } = computeSnapshotPoints([], TODAY, 2)
    expect(currencyMismatches).toEqual([])
    expect(points.every((p) => p.totalAmount === 0)).toBe(true)
  })
})

describe('computeSnapshotPoints — flat balance', () => {
  it('cash account with no transactions stays flat across the window', () => {
    const { points } = computeSnapshotPoints(
      [snap({ kind: 'cash', todayAmount: 1000 })],
      TODAY,
      5,
    )
    for (const p of points) {
      expect(p.cashAmount).toBe(1000)
      expect(p.investmentAmount).toBe(0)
      expect(p.totalAmount).toBe(1000)
    }
  })
})

describe('computeSnapshotPoints — walkback', () => {
  it("today's deposit subtracts on the prior day, not on today", () => {
    // Today's balance 1000 already reflects a +200 deposit dated today.
    // End-of-yesterday should be 800.
    const { points } = computeSnapshotPoints(
      [
        snap({
          todayAmount: 1000,
          txs: [{ date: '2026-04-28', amount: 200 }],
        }),
      ],
      TODAY,
      2,
    )
    expect(points[0].totalAmount).toBe(1000) // today
    expect(points[1].totalAmount).toBe(800) // yesterday
    expect(points[2].totalAmount).toBe(800) // day before — no further txs
  })

  it("yesterday's deposit subtracts on the day before yesterday", () => {
    // tx dated yesterday, today balance 1000.
    // - end-of-today = 1000 (already includes the tx)
    // - end-of-yesterday = 1000 (the deposit landed by end-of-day)
    // - end-of-day-before = 800 (before the deposit existed)
    const { points } = computeSnapshotPoints(
      [
        snap({
          todayAmount: 1000,
          txs: [{ date: '2026-04-27', amount: 200 }],
        }),
      ],
      TODAY,
      3,
    )
    expect(points[0].totalAmount).toBe(1000)
    expect(points[1].totalAmount).toBe(1000)
    expect(points[2].totalAmount).toBe(800)
    expect(points[3].totalAmount).toBe(800)
  })

  it('handles a negative tx (cash_out) correctly', () => {
    // Today's balance 850 already reflects a -150 spend today.
    // End-of-yesterday = 1000 (before the spend).
    const { points } = computeSnapshotPoints(
      [
        snap({
          todayAmount: 850,
          txs: [{ date: '2026-04-28', amount: -150 }],
        }),
      ],
      TODAY,
      1,
    )
    expect(points[0].totalAmount).toBe(850)
    expect(points[1].totalAmount).toBe(1000)
  })

  it('walks multiple transactions across days in DESC order', () => {
    // Today 1000. Past txs (sorted DESC):
    //   2026-04-28: +100   (today)
    //   2026-04-27: -50    (yesterday)
    //   2026-04-25: +200   (3 days back)
    const { points } = computeSnapshotPoints(
      [
        snap({
          todayAmount: 1000,
          txs: [
            { date: '2026-04-28', amount: 100 },
            { date: '2026-04-27', amount: -50 },
            { date: '2026-04-25', amount: 200 },
          ],
        }),
      ],
      TODAY,
      5,
    )
    expect(points.map((p) => [p.date, p.totalAmount])).toEqual([
      ['2026-04-28', 1000], // today
      ['2026-04-27', 900], // before today's +100
      ['2026-04-26', 950], // before yesterday's -50 (running back up)
      ['2026-04-25', 950], // tx dated 04-25 hasn't been "subtracted" yet
      ['2026-04-24', 750], // now subtract the +200
      ['2026-04-23', 750],
    ])
  })
})

describe('computeSnapshotPoints — investment vs cash', () => {
  it('investment kind goes to investmentAmount, cash to cashAmount', () => {
    const { points } = computeSnapshotPoints(
      [
        snap({ accountId: 'a', kind: 'cash', todayAmount: 1000 }),
        snap({
          accountId: 'b',
          kind: 'investment',
          todayAmount: 5000,
          balanceIncludesInvestments: true,
        }),
      ],
      TODAY,
      0,
    )
    expect(points[0].cashAmount).toBe(1000)
    expect(points[0].investmentAmount).toBe(5000)
    expect(points[0].totalAmount).toBe(6000)
  })

  it("'pension' is bucketed as investment", () => {
    const { points } = computeSnapshotPoints(
      [
        snap({
          kind: 'pension',
          todayAmount: 100000,
          balanceIncludesInvestments: true,
        }),
      ],
      TODAY,
      0,
    )
    expect(points[0].investmentAmount).toBe(100000)
    expect(points[0].cashAmount).toBe(0)
  })

  it('null kind is treated as cash', () => {
    const { points } = computeSnapshotPoints(
      [snap({ kind: null, todayAmount: 500 })],
      TODAY,
      0,
    )
    expect(points[0].cashAmount).toBe(500)
    expect(points[0].investmentAmount).toBe(0)
  })
})

describe('computeSnapshotPoints — balanceIncludesInvestments', () => {
  it('true: starting total is todayAmount (positions already counted)', () => {
    const { points } = computeSnapshotPoints(
      [
        snap({
          kind: 'investment',
          todayAmount: 5000,
          positionsValue: 4000,
          balanceIncludesInvestments: true,
        }),
      ],
      TODAY,
      0,
    )
    expect(points[0].investmentAmount).toBe(5000)
  })

  it('false: starting total is todayAmount + positionsValue', () => {
    const { points } = computeSnapshotPoints(
      [
        snap({
          kind: 'investment',
          todayAmount: 1000,
          positionsValue: 4000,
          balanceIncludesInvestments: false,
        }),
      ],
      TODAY,
      0,
    )
    expect(points[0].investmentAmount).toBe(5000)
  })
})

describe('computeSnapshotPoints — history overrides walkback', () => {
  it('history value wins over the walkback total on days it covers', () => {
    // Today 5000, +100 tx today (so walkback says 4900 yesterday).
    // History claims 6000 yesterday — history must win.
    const { points } = computeSnapshotPoints(
      [
        snap({
          kind: 'investment',
          todayAmount: 5000,
          balanceIncludesInvestments: true,
          txs: [{ date: '2026-04-28', amount: 100 }],
          history: new Map([['2026-04-27', 6000]]),
        }),
      ],
      TODAY,
      2,
    )
    expect(points[0].investmentAmount).toBe(5000) // today: no history entry
    expect(points[1].investmentAmount).toBe(6000) // history overrides walkback
    expect(points[2].investmentAmount).toBe(4900) // back to walkback (no history)
  })

  it('days before earliestHistoryDate are zero, not flat-lined at todayAmount', () => {
    // Avanza accounts sync no transactions, so without this guard the
    // walkback would flat-line at todayAmount for every day before the
    // chart's earliest point — making it look like the account always
    // had today's value.
    const { points } = computeSnapshotPoints(
      [
        snap({
          kind: 'investment',
          todayAmount: 5000,
          balanceIncludesInvestments: true,
          history: new Map([
            ['2026-04-28', 5000],
            ['2026-04-27', 4900],
          ]),
          earliestHistoryDate: '2026-04-27',
        }),
      ],
      TODAY,
      4,
    )
    expect(points[0].investmentAmount).toBe(5000) // today, in history
    expect(points[1].investmentAmount).toBe(4900) // yesterday, in history
    expect(points[2].investmentAmount).toBe(0) // before earliest
    expect(points[3].investmentAmount).toBe(0)
    expect(points[4].investmentAmount).toBe(0)
  })

  it('a 0 history value is respected (not treated as missing)', () => {
    // Regression guard: `realHistory != null` (not `realHistory ||`) is
    // what makes 0 win. Flipping to truthy check would break this.
    const { points } = computeSnapshotPoints(
      [
        snap({
          kind: 'investment',
          todayAmount: 5000,
          balanceIncludesInvestments: true,
          history: new Map([['2026-04-27', 0]]),
        }),
      ],
      TODAY,
      1,
    )
    expect(points[1].investmentAmount).toBe(0)
  })
})

describe('computeSnapshotPoints — currency mismatch', () => {
  it('records mismatched-currency accounts and excludes them from totals', () => {
    const { points, currencyMismatches } = computeSnapshotPoints(
      [
        snap({ accountId: 'usd', currency: 'USD', todayAmount: 1000 }),
        snap({ accountId: 'sek', currency: 'SEK', todayAmount: 500 }),
      ],
      TODAY,
      0,
    )
    expect(currencyMismatches).toEqual(['usd: USD ≠ SEK'])
    expect(points[0].cashAmount).toBe(500)
  })
})

describe('computeSnapshotPoints — rounding', () => {
  it('rounds amounts to 2 decimal places', () => {
    const { points } = computeSnapshotPoints(
      [snap({ todayAmount: 100.123456 })],
      TODAY,
      0,
    )
    expect(points[0].totalAmount).toBe(100.12)
    expect(points[0].cashAmount).toBe(100.12)
  })
})
