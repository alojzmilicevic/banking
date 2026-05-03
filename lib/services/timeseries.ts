// Timeseries service — produces the chart's data feed in the same
// holder-keyed shape as the dashboard service, so the FE iterates over
// `byHolder` instead of referencing 'alma'/'alojz' literals.

import {
  computeTodaySnapshot,
  getEarliestSnapshotDate,
  getSnapshotsRange,
} from '@/lib/sync/snapshots'
import type { TimeseriesPoint, TimeseriesResponse } from '@/lib/api/dashboard'

const MS_DAY = 86400_000

const PERIODS = ['1W', '1M', '3M', '1Y', 'ALL'] as const
export type Period = (typeof PERIODS)[number]

export function isPeriod(s: string): s is Period {
  return (PERIODS as readonly string[]).includes(s)
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function fromDateForPeriod(period: Period, today: Date, userId: string): string {
  const t = new Date(today)
  t.setUTCHours(0, 0, 0, 0)
  switch (period) {
    case '1W':
      return isoDay(new Date(t.getTime() - 7 * MS_DAY))
    case '1M':
      return isoDay(new Date(t.getTime() - 30 * MS_DAY))
    case '3M':
      return isoDay(new Date(t.getTime() - 90 * MS_DAY))
    case '1Y':
      return isoDay(new Date(t.getTime() - 365 * MS_DAY))
    case 'ALL':
    default:
      return getEarliestSnapshotDate(userId) ?? isoDay(t)
  }
}

export function getTimeseries(userId: string, period: Period): TimeseriesResponse {
  const today = computeTodaySnapshot(userId)
  const fromIso = fromDateForPeriod(period, new Date(), userId)
  const snaps = getSnapshotsRange(userId, fromIso, today.date)

  const series: TimeseriesPoint[] = snaps.length
    ? snaps.map((s) => ({
        date: s.date,
        total: s.totalAmount,
        cash: s.cashAmount,
        investment: s.investmentAmount,
        byHolder: s.byHolder,
        shared: s.sharedAmount,
        unassigned: s.unassignedAmount,
      }))
    : [
        {
          date: today.date,
          total: today.totalAmount,
          cash: today.cashAmount,
          investment: today.investmentAmount,
          byHolder: today.byHolder,
          shared: today.sharedAmount,
          unassigned: today.unassignedAmount,
        },
      ]

  return {
    series,
    current: {
      total: today.totalAmount,
      cash: today.cashAmount,
      investment: today.investmentAmount,
      byHolder: today.byHolder,
      shared: today.sharedAmount,
      unassigned: today.unassignedAmount,
    },
    currency: today.baseCurrency,
    period,
    points: series.length,
    errors: today.currencyMismatches,
  }
}
