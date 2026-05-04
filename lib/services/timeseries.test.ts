import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sync/snapshots', () => ({
  computeTodaySnapshot: vi.fn(),
  getEarliestSnapshotDate: vi.fn(),
  getSnapshotsRange: vi.fn(),
}))

import { getEarliestSnapshotDate } from '@/lib/sync/snapshots'
import { daysForPeriod, isPeriod } from './timeseries'

const mockedEarliest = vi.mocked(getEarliestSnapshotDate)

describe('isPeriod', () => {
  it.each(['1W', '1M', '3M', '1Y', 'ALL'])('accepts %s', (p) => {
    expect(isPeriod(p)).toBe(true)
  })

  it.each(['', '30D', '1w', '1y', 'all', 'foo'])('rejects %s', (p) => {
    expect(isPeriod(p)).toBe(false)
  })
})

describe('daysForPeriod — fixed windows', () => {
  it('1W → 7', () => {
    expect(daysForPeriod('1W', 'u1')).toBe(7)
  })
  it('1M → 30', () => {
    expect(daysForPeriod('1M', 'u1')).toBe(30)
  })
  it('3M → 90', () => {
    expect(daysForPeriod('3M', 'u1')).toBe(90)
  })
  it('1Y → 365', () => {
    expect(daysForPeriod('1Y', 'u1')).toBe(365)
  })

  it('does not call getEarliestSnapshotDate for fixed windows', () => {
    mockedEarliest.mockClear()
    daysForPeriod('1W', 'u1')
    daysForPeriod('1M', 'u1')
    daysForPeriod('3M', 'u1')
    daysForPeriod('1Y', 'u1')
    expect(mockedEarliest).not.toHaveBeenCalled()
  })
})

describe('daysForPeriod — ALL', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-28T12:34:56.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    mockedEarliest.mockReset()
  })

  it('returns days since the earliest snapshot date', () => {
    mockedEarliest.mockReturnValue('2026-04-21')
    // 2026-04-28 - 2026-04-21 = 7 days.
    expect(daysForPeriod('ALL', 'u1')).toBe(7)
  })

  it('handles a multi-year-old earliest snapshot', () => {
    mockedEarliest.mockReturnValue('2024-04-28')
    // 2024-04-28 → 2026-04-28: two non-leap-overlap years = 365 + 365 = 730 days.
    expect(daysForPeriod('ALL', 'u1')).toBe(730)
  })

  it('falls back to 30 when there are no snapshots', () => {
    mockedEarliest.mockReturnValue(null)
    expect(daysForPeriod('ALL', 'u1')).toBe(30)
  })

  it('clamps to at least 1 day when the earliest snapshot is today', () => {
    mockedEarliest.mockReturnValue('2026-04-28')
    expect(daysForPeriod('ALL', 'u1')).toBe(1)
  })

  it('passes the userId through to getEarliestSnapshotDate', () => {
    mockedEarliest.mockReturnValue('2026-04-21')
    daysForPeriod('ALL', 'user-xyz')
    expect(mockedEarliest).toHaveBeenCalledWith('user-xyz')
  })
})
